import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { hashPassword } from "../auth/password.js";
import { createDatabase } from "../db/client.js";
import { users } from "../db/schema.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
const email = process.env.XYJ_USER_EMAIL?.trim().toLowerCase();
const password = process.env.XYJ_USER_PASSWORD;
const displayName = process.env.XYJ_USER_NAME?.trim() || email?.split("@")[0] || "用户";

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
if (!email || !password) {
  console.error("Set XYJ_USER_EMAIL and XYJ_USER_PASSWORD.");
  process.exit(1);
}
if (password.length < 12) {
  console.error("XYJ_USER_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

const { db, pool } = createDatabase(databaseUrl);

try {
  const [existing] = await db.select().from(users).where(eq(users.emailNormalized, email)).limit(1);

  if (existing) {
    console.log(`User already exists: ${email} (${existing.id})`);
  } else {
    const [created] = await db
      .insert(users)
      .values({
        id: randomUUID(),
        emailNormalized: email,
        passwordHash: await hashPassword(password),
        displayName,
        ageGateState: "self_declared_adult",
      })
      .returning();
    if (!created) {
      throw new Error("User insert returned no row.");
    }
    console.log(`Created user ${created.emailNormalized} (${created.id})`);
  }
} catch (error) {
  console.error("Failed to create user:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
