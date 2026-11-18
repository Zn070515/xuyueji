import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/api/**/*.test.ts"],
    environment: "node",
    reporters: ["default"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
