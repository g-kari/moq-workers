import { test, expect } from "@playwright/test";

test.describe("配信ページ (index.html)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("ページタイトルが正しい", async ({ page }) => {
    await expect(page).toHaveTitle("MoQ 配信");
  });

  test("ヘッダーのロゴが表示される", async ({ page }) => {
    await expect(page.locator(".logo")).toContainText("MoQ 配信");
  });

  test("視聴ページへのリンクがある", async ({ page }) => {
    const watchLink = page.locator('a[href="/watch.html"]');
    await expect(watchLink).toBeVisible();
  });

  test("APIキー入力フィールドが存在する", async ({ page }) => {
    const input = page.locator("#apiKey");
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute("type", "password");
  });

  test("ルーム名入力フィールドが存在する", async ({ page }) => {
    const input = page.locator("#roomName");
    await expect(input).toBeVisible();
  });

  test("配信開始ボタンが存在する", async ({ page }) => {
    const btn = page.locator("#startBtn");
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });

  test("共有ボックスは初期状態で非表示", async ({ page }) => {
    const shareBox = page.locator("#shareBox");
    await expect(shareBox).not.toBeVisible();
  });

  test("配信UIは初期状態で非表示", async ({ page }) => {
    const publisherUi = page.locator("#publisherUi");
    await expect(publisherUi).not.toBeVisible();
  });

  test("APIキーが空の場合にエラーを表示", async ({ page }) => {
    await page.locator("#apiKey").fill("");
    await page.locator("#startBtn").click();
    await expect(page.locator("#status")).toContainText("入力してください");
  });

  test("ルーム名が空の場合にエラーを表示", async ({ page }) => {
    await page.locator("#roomName").fill("");
    await page.locator("#startBtn").click();
    await expect(page.locator("#status")).toContainText("入力してください");
  });

  test("API成功時に共有URLと配信UIが表示される", async ({ page }) => {
    const roomId = "test-room-123";

    // API モック
    await page.route("**/api/rooms", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { id: roomId, name: "テスト配信" } }),
        });
      }
    });

    await page.route(`**/api/rooms/${roomId}/token`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            token: "test-jwt-token",
            url: "https://cdn.moq.dev/rooms/test-room-123",
          },
        }),
      });
    });

    await page.locator("#startBtn").click();

    // 共有ボックスが表示される
    await expect(page.locator("#shareBox")).toBeVisible({ timeout: 5000 });

    // 視聴 URL に /watch.html が含まれる
    const shareUrl = page.locator("#shareUrl");
    await expect(shareUrl).toContainText("watch.html");
    await expect(shareUrl).toContainText("test-jwt-token");

    // 配信 UI が表示される
    await expect(page.locator("#publisherUi")).toBeVisible();

    // ステータスメッセージ
    await expect(page.locator("#status")).toContainText("配信準備完了");
  });

  test("API失敗時にエラーメッセージが表示される", async ({ page }) => {
    await page.route("**/api/rooms", async (route) => {
      await route.fulfill({ status: 500 });
    });

    await page.locator("#startBtn").click();

    await expect(page.locator("#status")).toHaveClass(/error/, { timeout: 5000 });
    await expect(page.locator("#status")).toContainText("失敗");

    // ボタンが再度有効になる
    await expect(page.locator("#startBtn")).toBeEnabled();
  });

  test("コピーボタンが機能する", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    const roomId = "copy-test-room";
    await page.route("**/api/rooms", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { id: roomId } }),
      });
    });
    await page.route(`**/api/rooms/${roomId}/token`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { token: "copy-token", url: "https://cdn.moq.dev/rooms/copy" },
        }),
      });
    });

    await page.locator("#startBtn").click();
    await expect(page.locator("#shareBox")).toBeVisible({ timeout: 5000 });

    await page.locator("#copyBtn").click();
    await expect(page.locator("#copyBtn")).toContainText("コピー済");
  });
});
