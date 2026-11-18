import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    server: "src/server.ts",
    migrate: "src/db/migrate.ts",
  },
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/^@xuyueji\//],
});
