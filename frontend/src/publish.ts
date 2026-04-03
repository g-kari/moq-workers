import "@moq/publish/element";
import "@moq/publish/ui";

const API_BASE = "https://moq-workers.0g0.workers.dev";
const BROADCAST_NAME = "live";

const apiKeyInput = document.getElementById("apiKey") as HTMLInputElement;
const roomNameInput = document.getElementById("roomName") as HTMLInputElement;
const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLParagraphElement;
const shareBox = document.getElementById("shareBox") as HTMLDivElement;
const shareUrlEl = document.getElementById("shareUrl") as HTMLDivElement;
const copyBtn = document.getElementById("copyBtn") as HTMLButtonElement;
const publisherUi = document.getElementById("publisherUi") as HTMLElement;
const publisher = document.getElementById("publisher") as HTMLElement;

function setStatus(msg: string, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = isError ? "status error" : "status";
}

startBtn.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  const roomName = roomNameInput.value.trim();

  if (!apiKey || !roomName) {
    setStatus("APIキーとルーム名を入力してください", true);
    return;
  }

  startBtn.disabled = true;
  setStatus("ルームを作成中...");

  try {
    // ルーム作成
    const roomRes = await fetch(`${API_BASE}/api/rooms`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: roomName }),
    });
    if (!roomRes.ok) throw new Error("ルーム作成に失敗しました");
    const { data: room } = await roomRes.json() as { data: { id: string } };

    setStatus("トークンを取得中...");

    // 配信者トークン取得
    const pubTokenRes = await fetch(`${API_BASE}/api/rooms/${room.id}/token`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: "publish", expiresIn: 86400 }),
    });
    if (!pubTokenRes.ok) throw new Error("トークン取得に失敗しました");
    const { data: pubToken } = await pubTokenRes.json() as { data: { token: string; url: string } };

    // 視聴者トークン取得
    const subTokenRes = await fetch(`${API_BASE}/api/rooms/${room.id}/token`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: "subscribe", expiresIn: 86400 }),
    });
    if (!subTokenRes.ok) throw new Error("トークン取得に失敗しました");
    const { data: subToken } = await subTokenRes.json() as { data: { token: string; url: string } };

    // 配信コンポーネントに接続先を設定
    const relayUrl = `${pubToken.url}?jwt=${pubToken.token}`;
    const subRelayUrl = `${subToken.url}?jwt=${subToken.token}`;
    publisher.setAttribute("url", relayUrl);
    publisher.setAttribute("name", BROADCAST_NAME);
    publisherUi.classList.add("visible");

    // デバッグパネルに情報を渡す
    (window as unknown as { __dbgUpdate?: (a: string, b: string, c: string) => void }).__dbgUpdate?.(
      room.id, relayUrl, subRelayUrl
    );

    // 視聴 URL を生成して表示
    const watchUrl = new URL("/watch.html", window.location.href);
    watchUrl.searchParams.set("url", subRelayUrl);
    watchUrl.searchParams.set("name", BROADCAST_NAME);
    const watchUrlStr = watchUrl.toString();

    shareUrlEl.textContent = watchUrlStr;
    shareBox.classList.add("visible");
    setStatus("配信準備完了！カメラを選択して配信を開始してください。");

    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(watchUrlStr).then(() => {
        copyBtn.textContent = "コピー済！";
        setTimeout(() => { copyBtn.textContent = "コピー"; }, 2000);
      });
    });

  } catch (e) {
    setStatus(e instanceof Error ? e.message : "エラーが発生しました", true);
    startBtn.disabled = false;
  }
});
