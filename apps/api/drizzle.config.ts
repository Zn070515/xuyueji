import "dotenv/config";

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL?.trim() || "postgres://xuyueji:xuyueji_dev@127.0.0.1:5432/xuyueji",
  },
  strict: true,
  verbose: true,
});
