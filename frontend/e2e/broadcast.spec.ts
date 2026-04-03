import { test, expect, Browser, BrowserContext } from "@playwright/test";

/**
 * 配信→視聴 統合テスト
 *
 * 本番サーバー (moq.0g0.xyz) に対して実際に接続するテスト。
 * Chrome のフェイクカメラ映像を使って moq-publish → cdn.moq.dev → moq-watch の
 * エンドツーエンドの動作を確認する。
 *
 * 実行: npm run test:e2e:broadcast
 */

/** moq-publish の配信ステータスを JS から読み取るヘルパー */
async function getPublishStatus(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.getElementById("publisher") as HTMLElement & {
      broadcast?: { status?: { get?: () => string } };
    };
    return el?.broadcast?.status?.get?.() ?? "unknown";
  });
}

/** moq-watch の視聴ステータスを JS から読み取るヘルパー */
async function getWatchStatus(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.getElementById("viewer") as HTMLElement & {
      broadcast?: { status?: { get?: () => string } };
    };
    return el?.broadcast?.status?.get?.() ?? "unknown";
  });
}

/** canvas に何か描画されているか確認するヘルパー */
async function isCanvasDrawn(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => {
    const canvas = document.querySelector("moq-watch canvas") as HTMLCanvasElement | null;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return false;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return data.some((v) => v !== 0);
  });
}

test.describe("配信→視聴 統合テスト", () => {
  test("配信を開始して視聴 URL を取得できる", async ({ page }) => {
    await page.goto("/");

    // デフォルト値のまま配信開始
    await page.locator("#startBtn").click();

    // 共有 URL が表示されるまで待機（実 API 呼び出し）
    await expect(page.locator("#shareBox")).toBeVisible({ timeout: 15_000 });

    const shareUrl = await page.locator("#shareUrl").textContent();
    expect(shareUrl).toContain("watch.html");
    expect(shareUrl).toContain("url=");
    expect(shareUrl).toContain("name=");

    // 配信 UI が表示される
    await expect(page.locator("#publisherUi")).toBeVisible();

    // ステータスが配信準備完了になる
    await expect(page.locator("#status")).toContainText("配信準備完了");
  });

  test("配信ステータスが connecting または live になる", async ({ page }) => {
    await page.goto("/");
    await page.locator("#startBtn").click();
    await expect(page.locator("#shareBox")).toBeVisible({ timeout: 15_000 });

    // moq-publish に url と name が設定される
    const publisher = page.locator("moq-publish#publisher");
    await expect(publisher).toHaveAttribute("url", /cdn\.moq\.dev/, { timeout: 10_000 });
    await expect(publisher).toHaveAttribute("name", "live");

    // 接続状態になるまで待機
    await page.waitForFunction(
      () => {
        const el = document.getElementById("publisher") as HTMLElement & {
          broadcast?: { status?: { get?: () => string } };
        };
        const status = el?.broadcast?.status?.get?.();
        return status === "live" || status === "connecting" || status === "audio-only" || status === "video-only";
      },
      { timeout: 20_000 }
    );

    const status = await getPublishStatus(page);
    console.log("配信ステータス:", status);
    expect(["connecting", "live", "audio-only", "video-only"]).toContain(status);
  });

  test("配信→視聴 フルフロー", async ({ browser }) => {
    // ---- 配信者セッション ----
    const publishContext: BrowserContext = await browser.newContext({
      permissions: ["camera", "microphone"],
    });
    const publishPage = await publishContext.newPage();
    await publishPage.goto("/");
    await publishPage.locator("#startBtn").click();
    await expect(publishPage.locator("#shareBox")).toBeVisible({ timeout: 15_000 });

    // 視聴 URL を取得
    const watchUrl = await publishPage.locator("#shareUrl").textContent();
    expect(watchUrl).toBeTruthy();

    // 配信が接続状態になるまで待機
    await publishPage.waitForFunction(
      () => {
        const el = document.getElementById("publisher") as HTMLElement & {
          broadcast?: { status?: { get?: () => string } };
        };
        const s = el?.broadcast?.status?.get?.();
        return s === "live" || s === "connecting" || s === "audio-only" || s === "video-only";
      },
      { timeout: 20_000 }
    );
    console.log("配信ステータス:", await getPublishStatus(publishPage));

    // ---- 視聴者セッション ----
    const watchContext: BrowserContext = await browser.newContext();
    const watchPage = await watchContext.newPage();
    await watchPage.goto(watchUrl!);

    // moq-watch に属性がセットされている
    const viewer = watchPage.locator("moq-watch#viewer");
    await expect(viewer).toHaveAttribute("url", /.+/, { timeout: 5_000 });
    await expect(viewer).toHaveAttribute("name", "live");

    // 視聴ステータスが loading または live になるまで待機
    await watchPage.waitForFunction(
      () => {
        const el = document.getElementById("viewer") as HTMLElement & {
          broadcast?: { status?: { get?: () => string } };
        };
        const s = el?.broadcast?.status?.get?.();
        return s === "live" || s === "loading" || s === "connecting";
      },
      { timeout: 30_000 }
    );

    const watchStatus = await getWatchStatus(watchPage);
    console.log("視聴ステータス:", watchStatus);
    expect(["connecting", "loading", "live"]).toContain(watchStatus);

    // canvas に描画が始まったか確認 (live になった場合のみ)
    if (watchStatus === "live") {
      await watchPage.waitForFunction(
        () => {
          const canvas = document.querySelector("moq-watch canvas") as HTMLCanvasElement | null;
          if (!canvas || canvas.width === 0) return false;
          const data = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
          return data ? data.some((v) => v !== 0) : false;
        },
        { timeout: 15_000 }
      );
      expect(await isCanvasDrawn(watchPage)).toBe(true);
      console.log("canvas への描画を確認");
    }

    await publishContext.close();
    await watchContext.close();
  });
});
