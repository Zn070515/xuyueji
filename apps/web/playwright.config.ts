import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  outputDir: "../../artifacts/playwright",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @xuyueji/api exec tsx src/server.ts",
      cwd: repoRoot,
      url: "http://127.0.0.1:3000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DEMO_MODE: "true",
        API_HOST: "127.0.0.1",
        API_PORT: "3000",
        DATABASE_URL:
          process.env.DATABASE_URL ?? "postgres://xuyueji:xuyueji_dev@127.0.0.1:5432/xuyueji",
        PUBLIC_SIGNUP_ENABLED: "true",
        AUTH_SIGNUP_RATE_LIMIT_MAX: "1000",
        AUTH_LOGIN_RATE_LIMIT_MAX: "1000",
      },
    },
    {
      command: "pnpm --filter @xuyueji/web exec vite --host 127.0.0.1 --port 5173",
      cwd: repoRoot,
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 960 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
});
