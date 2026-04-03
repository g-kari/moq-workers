import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/broadcast.spec.ts",
  fullyParallel: false,
  retries: 1,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: "https://moq.0g0.xyz",
    trace: "on-first-retry",
    // フェイクカメラ・マイクを有効化
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
      ],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
