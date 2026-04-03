import { test, expect, BrowserContext } from "@playwright/test";

/**
 * 配信→視聴 統合テスト
 *
 * 本番サーバー (moq-workers-frontend2.pages.dev) に対して実際に接続するテスト。
 * Chrome のフェイクカメラ映像を使って moq-publish → cdn.moq.dev → moq-watch の
 * エンドツーエンドの動作を確認する。
 *
 * 注意: WSL2 / QUIC ブロック環境では CDN 接続テストが失敗する場合がある。
 *   WebTransport (QUIC) が ERR_QUIC_PROTOCOL_ERROR になる環境制約のため。
 *   実ブラウザ (Windows/macOS Chrome) では正常に動作する。
 *
 * 実行: npm run test:e2e:broadcast
 */

/** WebTransport (QUIC) が環境でサポートされているか確認 */
async function checkQUICSupport(page: import("@playwright/test").Page, url: string): Promise<boolean> {
  return page.evaluate(async (u) => {
    try {
      const transport = new WebTransport(u);
      await Promise.race([
        transport.ready,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8_000)),
      ]);
      transport.close();
      return true;
    } catch {
      return false;
    }
  }, url);
}

/** moq-watch のステータスを読み取るヘルパー */
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
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data.some((v) => v !== 0);
  });
}

test.describe("配信→視聴 統合テスト", () => {
  test("配信を開始して視聴 URL を取得できる", async ({ page }) => {
    await page.goto("/");
    await page.locator("#startBtn").click();

    // 実 API 呼び出し: ルーム作成 + トークン取得
    await expect(page.locator("#shareBox")).toBeVisible({ timeout: 15_000 });

    const shareUrl = await page.locator("#shareUrl").textContent();
    expect(shareUrl).toContain("watch.html");
    expect(shareUrl).toContain("url=");
    expect(shareUrl).toContain("name=");

    await expect(page.locator("#publisherUi")).toBeVisible();
    await expect(page.locator("#status")).toContainText("配信準備完了");

    // moq-publish に正しい属性がセットされる
    const publisher = page.locator("moq-publish#publisher");
    await expect(publisher).toHaveAttribute("url", /cdn\.moq\.dev/, { timeout: 5_000 });
    await expect(publisher).toHaveAttribute("name", "live");
  });

  test("CDN (cdn.moq.dev) への WebTransport 接続を試みる", async ({ page }) => {
    await page.goto("/");
    await page.locator("#startBtn").click();
    await expect(page.locator("#shareBox")).toBeVisible({ timeout: 15_000 });

    const publishUrl = await page.locator("moq-publish#publisher").getAttribute("url");
    expect(publishUrl).toMatch(/cdn\.moq\.dev/);

    // WebTransport (QUIC) 接続を試みる
    const connected = await checkQUICSupport(page, publishUrl!);
    console.log(`WebTransport QUIC: ${connected ? "✓ 接続成功" : "✗ 環境制約 (QUIC ブロック)"}`);

    if (!connected) {
      // WSL2 / QUIC ブロック環境では既知の制約 — スキップ
      test.skip(true, "QUIC がブロックされた環境では WebTransport に接続できない");
    }
  });

  test("配信→視聴 フルフロー (QUIC 利用可能時)", async ({ browser }) => {
    // ---- 配信者セッション ----
    const publishContext: BrowserContext = await browser.newContext({
      permissions: ["camera", "microphone"],
    });
    const publishPage = await publishContext.newPage();
    await publishPage.goto("/");
    await publishPage.locator("#startBtn").click();
    await expect(publishPage.locator("#shareBox")).toBeVisible({ timeout: 15_000 });

    const shareUrlText = await publishPage.locator("#shareUrl").textContent();
    expect(shareUrlText).toBeTruthy();

    // QUIC 接続可否を事前確認
    const publishUrl = await publishPage.locator("moq-publish#publisher").getAttribute("url");
    const quicOk = await checkQUICSupport(publishPage, publishUrl!);
    console.log(`WebTransport QUIC: ${quicOk ? "✓ 利用可能" : "✗ 環境制約"}`);

    if (!quicOk) {
      await publishContext.close();
      test.skip(true, "QUIC がブロックされた環境では WebTransport に接続できない");
    }

    // QUIC が使えるなら配信が確立するまで待機
    await publishPage.waitForFunction(
      () => {
        const el = document.getElementById("publisher") as HTMLElement & {
          broadcast?: { connection?: { get?: () => unknown } };
        };
        return el?.broadcast?.connection?.get?.() !== undefined;
      },
      { timeout: 20_000 }
    );
    console.log("配信 CDN 接続: ✓");

    // ---- 視聴者セッション ----
    const watchContext: BrowserContext = await browser.newContext();
    const watchPage = await watchContext.newPage();
    await watchPage.goto(shareUrlText!);

    // 視聴ステータスが loading または live になるまで待機
    await watchPage.waitForFunction(
      () => {
        const el = document.getElementById("viewer") as HTMLElement & {
          broadcast?: { status?: { get?: () => string } };
        };
        const s = el?.broadcast?.status?.get?.();
        return s === "loading" || s === "live";
      },
      { timeout: 30_000 }
    );

    const watchStatus = await getWatchStatus(watchPage);
    console.log("視聴ステータス:", watchStatus);
    expect(["loading", "live"]).toContain(watchStatus);

    if (watchStatus === "live") {
      await watchPage.waitForFunction(
        () => {
          const canvas = document.querySelector("moq-watch canvas") as HTMLCanvasElement | null;
          if (!canvas || canvas.width === 0) return false;
          return canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data.some((v) => v !== 0) ?? false;
        },
        { timeout: 15_000 }
      );
      console.log("canvas 描画: ✓");
      expect(await isCanvasDrawn(watchPage)).toBe(true);
    }

    await publishContext.close();
    await watchContext.close();
  });
});
