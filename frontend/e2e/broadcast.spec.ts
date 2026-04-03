import { test, expect } from "@playwright/test";

/**
 * 配信→視聴 統合テスト
 *
 * 本番サーバー (moq-workers-frontend2.pages.dev) + 実 API (moq-workers.0g0.workers.dev) で動作確認。
 * WebTransport (QUIC) の実接続は WSL2 環境でブロックされるため、
 * 配信/視聴コンポーネントへの設定が正しく行われることを検証する。
 *
 * 実行: npm run test:e2e:broadcast
 */

test.describe("配信フロー", () => {
  test("ルーム作成・トークン取得・共有URL生成が完了する", async ({ page }) => {
    await page.goto("/");
    await page.locator("#startBtn").click();

    // 実 API 呼び出し完了を待つ
    await expect(page.locator("#shareBox")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#status")).toContainText("配信準備完了");

    // 共有 URL が正しい形式になっている
    const shareUrl = await page.locator("#shareUrl").textContent();
    expect(shareUrl).toMatch(/watch\.html\?url=.+&name=live/);

    // 視聴 URL に署名済み JWT が含まれている
    const parsed = new URL(shareUrl!);
    const relayUrl = parsed.searchParams.get("url");
    expect(relayUrl).toMatch(/cdn\.moq\.dev/);
    expect(relayUrl).toMatch(/jwt=/);
  });

  test("moq-publish コンポーネントに正しい属性がセットされる", async ({ page }) => {
    await page.goto("/");
    await page.locator("#startBtn").click();

    await expect(page.locator("#shareBox")).toBeVisible({ timeout: 15_000 });

    const publisher = page.locator("moq-publish#publisher");
    // CDN URL + PUT 権限の JWT がセットされる
    await expect(publisher).toHaveAttribute("url", /cdn\.moq\.dev.*jwt=/, { timeout: 5_000 });
    // ブロードキャスト名がセットされる
    await expect(publisher).toHaveAttribute("name", "live");
    // ソースはカメラ
    await expect(publisher).toHaveAttribute("source", "camera");
  });
});

test.describe("視聴フロー", () => {
  test("共有 URL から moq-watch コンポーネントに正しい属性がセットされる", async ({ page, browser }) => {
    // まず配信ページで共有 URL を取得
    const publishPage = await browser.newPage();
    await publishPage.goto("/");
    await publishPage.locator("#startBtn").click();
    await expect(publishPage.locator("#shareBox")).toBeVisible({ timeout: 15_000 });

    const shareUrl = (await publishPage.locator("#shareUrl").textContent())!;
    await publishPage.close();

    // 視聴ページを共有 URL で開く
    await page.goto(shareUrl);

    const viewer = page.locator("moq-watch#viewer");
    // CDN URL + GET 権限の JWT がセットされる
    await expect(viewer).toHaveAttribute("url", /cdn\.moq\.dev.*jwt=/, { timeout: 5_000 });
    // ブロードキャスト名がセットされる
    await expect(viewer).toHaveAttribute("name", "live");
    // エラーメッセージは表示されない
    await expect(page.locator("#error")).toBeEmpty();
  });

  test("視聴ページが CDN への接続を試みる (offline はネットワーク次第)", async ({ page, browser }) => {
    const publishPage = await browser.newPage();
    await publishPage.goto("/");
    await publishPage.locator("#startBtn").click();
    await expect(publishPage.locator("#shareBox")).toBeVisible({ timeout: 15_000 });

    const shareUrl = (await publishPage.locator("#shareUrl").textContent())!;
    await publishPage.close();

    await page.goto(shareUrl);

    // moq-watch が接続を試み、status が unknown 以外になるまで待機
    await page.waitForFunction(
      () => {
        const el = document.getElementById("viewer") as HTMLElement & {
          broadcast?: { status?: { get?: () => string } };
        };
        const s = el?.broadcast?.status?.get?.();
        return s !== undefined && s !== "unknown";
      },
      { timeout: 20_000 }
    );

    const status = await page.evaluate(() => {
      const el = document.getElementById("viewer") as HTMLElement & {
        broadcast?: { status?: { get?: () => string } };
      };
      return el?.broadcast?.status?.get?.() ?? "unknown";
    });
    console.log("視聴ステータス:", status);

    // offline = CDN に接続できたが配信なし、loading/live = 配信あり、どちらも正常
    expect(["offline", "loading", "live"]).toContain(status);
  });
});
