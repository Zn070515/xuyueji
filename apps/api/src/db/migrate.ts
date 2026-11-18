import "dotenv/config";

import path from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDatabase } from "./client.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is required to run migrations.");
  process.exit(1);
}

const migrationsFolder = path.resolve(
  process.cwd(),
  process.env.MIGRATIONS_DIR?.trim() || "migrations",
);

const { db, pool } = createDatabase(databaseUrl);

try {
  await migrate(db, { migrationsFolder });
  console.log(`Migrations applied from ${migrationsFolder}`);
} catch (error) {
  console.error("Migration failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
