import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

// 既存 TypeScript を読み込むだけ。実際のネットワークや Cloudflare は使わない。
register("./source-loader.mjs", import.meta.url);
const { default: app } = await import("../src/index.ts");

const origin = "https://fixture.invalid";
const authorization = "Bearer synthetic-fixture-key";

function fixtureEnvironment() {
  const records = new Map();
  return {
    API_KEY: "synthetic-fixture-key",
    MOQ_SIGNING_KEY: "unused-synthetic-fixture-key",
    ROOMS_KV: {
      async get(key) { return records.get(key) ?? null; },
      async put(key, value) { records.set(key, value); },
      async delete(key) { records.delete(key); },
      async list({ prefix }) {
        return { keys: [...records.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })) };
      },
    },
    records,
  };
}

test("lock は Hono の最小修正版を参照する", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.equal(manifest.dependencies.hono, "^4.12.34");
  assert.equal(lock.packages[""].dependencies.hono, manifest.dependencies.hono);
  assert.equal(lock.packages["node_modules/hono"].version, "4.12.34");
});

test("通常の preflight と許可メソッドを維持する", async () => {
  const response = await app.request("/api/rooms", {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Authorization, Content-Type" },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(response.headers.get("Access-Control-Allow-Headers"), "Authorization,Content-Type");
  assert.equal(response.headers.get("Access-Control-Allow-Methods"), "GET,HEAD,PUT,POST,DELETE,PATCH");
  assert.match(response.headers.get("Vary"), /Access-Control-Request-Headers/i);
  assert.equal(response.headers.get("Content-Type"), null);
  assert.equal(await response.text(), "");
});

test("空白を含む小さい header fixture を正規表現の split なしで処理する", async () => {
  // 最大 88 文字の合成値。長大入力や時間しきい値で DoS を再現しない。
  const requestHeaders = `X-First${"\t ".repeat(32)}, X-Second`;
  const originalSplit = String.prototype.split;
  const observedSeparators = [];
  String.prototype.split = function (separator, ...arguments_) {
    if (String(this) === requestHeaders) {
      observedSeparators.push(separator);
      assert.equal(separator, ",", "CORS header の tokenization に正規表現を使わない");
    }
    return Reflect.apply(originalSplit, this, [separator, ...arguments_]);
  };
  let response;
  try {
    response = await app.request("/health", {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Headers": requestHeaders },
    });
  } finally {
    String.prototype.split = originalSplit;
  }
  assert.equal(response.status, 204);
  assert.deepEqual(observedSeparators, [","]);
  assert.equal(response.headers.get("Access-Control-Allow-Headers"), "X-First,X-Second");
});

test("空の header と空要素を含む preflight を扱う", async () => {
  for (const [value, expected] of [["", null], ["X-First, , X-Second", "X-First,,X-Second"]]) {
    const response = await app.request("/api/rooms", {
      method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Headers": value },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("Access-Control-Allow-Headers"), expected);
  }
});

test("health の成功応答と CORS を維持する", async () => {
  const response = await app.request("/health", { headers: { Origin: origin } });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.status, "ok");
  assert.ok(Number.isFinite(Date.parse(data.timestamp)));
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
});

test("未認証と不正な API key を拒否する", async () => {
  const environment = fixtureEnvironment();
  for (const [headers, expected] of [[{}, 401], [{ Authorization: "Bearer incorrect-synthetic-key" }, 403]]) {
    const response = await app.request("/api/rooms", { headers }, environment);
    assert.equal(response.status, expected);
    assert.equal((await response.json()).success, false);
  }
  assert.equal(environment.records.size, 0);
});

test("合成 KV でルーム作成・一覧・取得・削除を維持する", async () => {
  const environment = fixtureEnvironment();
  const headers = { Authorization: authorization, "Content-Type": "application/json", Origin: origin };
  const created = await app.request("/api/rooms", { method: "POST", headers, body: JSON.stringify({ name: " fixture room ", description: " synthetic " }) }, environment);
  assert.equal(created.status, 201);
  const { data: room } = await created.json();
  assert.equal(room.name, "fixture room");
  assert.equal(room.description, "synthetic");
  const listed = await app.request("/api/rooms", { headers }, environment);
  assert.deepEqual((await listed.json()).data.map(({ id }) => id), [room.id]);
  const retrieved = await app.request(`/api/rooms/${room.id}`, { headers }, environment);
  assert.equal((await retrieved.json()).data.root, `rooms/${room.id}`);
  const removed = await app.request(`/api/rooms/${room.id}`, { method: "DELETE", headers }, environment);
  assert.equal(removed.status, 200);
  assert.deepEqual((await removed.json()).data, { deleted: true });
  const missing = await app.request(`/api/rooms/${room.id}`, { headers }, environment);
  assert.equal(missing.status, 404);
  assert.equal(environment.records.size, 0);
});

test("ルーム名と token 入力の検証を維持する", async () => {
  const environment = fixtureEnvironment();
  const headers = { Authorization: authorization, "Content-Type": "application/json" };
  const unnamed = await app.request("/api/rooms", { method: "POST", headers, body: JSON.stringify({ name: " " }) }, environment);
  assert.equal(unnamed.status, 400);
  environment.records.set("room:fixture-id", JSON.stringify({ id: "fixture-id", root: "rooms/fixture-id" }));
  for (const body of [{}, { permissions: "unsupported" }, { permissions: "publish", expiresIn: 0 }, { permissions: "subscribe", expiresIn: 86401 }]) {
    const response = await app.request("/api/rooms/fixture-id/token", { method: "POST", headers, body: JSON.stringify(body) }, environment);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).success, false);
  }
});
