import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/api/**/*.test.ts", "apps/web/src/**/*.test.ts"],
    // Integration tests share one PostgreSQL database and truncate it; run
    // files serially so schema and M1 suites cannot race each other.
    fileParallelism: false,
    environment: "node",
    reporters: ["default"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
