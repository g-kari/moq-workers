import { test, expect } from "@playwright/test";

test.describe("視聴ページ (watch.html)", () => {
  test("ページタイトルが正しい", async ({ page }) => {
    await page.goto("/watch.html");
    await expect(page).toHaveTitle("MoQ 視聴");
  });

  test("ヘッダーのロゴが表示される", async ({ page }) => {
    await page.goto("/watch.html");
    await expect(page.locator(".logo")).toContainText("MoQ 視聴");
  });

  test("配信ページへのリンクがある", async ({ page }) => {
    await page.goto("/watch.html");
    await expect(page.locator('a[href="/"].btn-ghost')).toBeVisible();
  });

  test("URLパラメータなしでエラーを表示", async ({ page }) => {
    await page.goto("/watch.html");
    const error = page.locator("#error");
    await expect(error).toContainText("URLが無効");
  });

  test("urlパラメータのみでもエラーを表示", async ({ page }) => {
    await page.goto("/watch.html?url=https://cdn.moq.dev/rooms/abc");
    const error = page.locator("#error");
    await expect(error).toContainText("URLが無効");
  });

  test("nameパラメータのみでもエラーを表示", async ({ page }) => {
    await page.goto("/watch.html?name=live");
    const error = page.locator("#error");
    await expect(error).toContainText("URLが無効");
  });

  test("有効なパラメータでエラーが表示されない", async ({ page }) => {
    await page.goto("/watch.html?url=https://cdn.moq.dev/rooms/abc?jwt=token&name=live");
    const error = page.locator("#error");
    await expect(error).toBeEmpty();
  });

  test("有効なパラメータで moq-watch に属性がセットされる", async ({ page }) => {
    const relayUrl = "https://cdn.moq.dev/rooms/abc?jwt=testtoken";
    const name = "live";
    await page.goto(`/watch.html?url=${encodeURIComponent(relayUrl)}&name=${name}`);

    const viewer = page.locator("moq-watch#viewer");
    await expect(viewer).toHaveAttribute("url", relayUrl);
    await expect(viewer).toHaveAttribute("name", name);
  });

  test("moq-watch-ui が表示される", async ({ page }) => {
    await page.goto("/watch.html");
    await expect(page.locator("moq-watch-ui")).toBeVisible();
  });

  test("moq-watch の内側に canvas がある", async ({ page }) => {
    await page.goto("/watch.html");
    await expect(page.locator("moq-watch canvas")).toBeAttached();
  });
});
