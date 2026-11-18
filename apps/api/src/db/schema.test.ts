import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, type Database } from "./client.js";
import {
  branches,
  conversations,
  generationRuns,
  paymentOrders,
  users,
  walletLedger,
  wallets,
} from "./schema.js";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

/**
 * Drizzle wraps driver errors in DrizzleQueryError; the PostgreSQL constraint
 * name lives on the cause (node-postgres error), not the wrapper message.
 */
async function expectConstraintViolation(
  action: () => Promise<unknown>,
  constraint: string,
): Promise<void> {
  let caught: unknown;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  expect(caught, `expected ${constraint} to reject the write`).toBeDefined();
  const cause = (caught as { cause?: { constraint?: string } }).cause;
  const direct = caught as { constraint?: string };
  expect(cause?.constraint ?? direct.constraint).toBe(constraint);
}

describeWithDatabase("PostgreSQL schema constraints", () => {
  let db: Database;
  let pool: ReturnType<typeof createDatabase>["pool"];

  beforeAll(async () => {
    const created = createDatabase(databaseUrl as string);
    db = created.db;
    pool = created.pool;
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL("../../migrations", import.meta.url)),
    });
    await pool.query(
      "TRUNCATE users, conversations, branches, generation_runs, wallets, wallet_ledger, payment_orders CASCADE",
    );
  });

  afterAll(async () => {
    await pool.query(
      "TRUNCATE users, conversations, branches, generation_runs, wallets, wallet_ledger, payment_orders CASCADE",
    );
    await pool.end();
  });

  async function insertUser(): Promise<string> {
    const id = randomUUID();
    await db.insert(users).values({ id });
    return id;
  }

  it("rejects a negative wallet balance at the database layer", async () => {
    const userId = await insertUser();
    await expectConstraintViolation(
      () =>
        db.insert(wallets).values({
          id: randomUUID(),
          ownerUserId: userId,
          availablePoints: -1,
          reservedPoints: 0,
        }),
      "wallets_available_nonnegative",
    );
  });

  it("rejects duplicate merchant trade numbers", async () => {
    const userId = await insertUser();
    const order = {
      id: randomUUID(),
      merchantTradeNo: "XYJ_DB_DUPLICATE_1",
      ownerUserId: userId,
      amountFen: 600,
      points: 60,
    };
    await db.insert(paymentOrders).values(order);
    await expectConstraintViolation(
      () => db.insert(paymentOrders).values({ ...order, id: randomUUID() }),
      "payment_orders_merchant_trade_uq",
    );
  });

  it("rejects duplicate ledger idempotency keys", async () => {
    const userId = await insertUser();
    const entry = {
      id: randomUUID(),
      ownerUserId: userId,
      kind: "topup",
      deltaAvailable: 60,
      deltaReserved: 0,
      refKind: "payment_order",
      refId: "XYJ_DB_LEDGER_1",
      uniqueKey: "topup:XYJ_DB_LEDGER_1",
      occurredAt: new Date().toISOString(),
    };
    await db.insert(walletLedger).values(entry);
    await expectConstraintViolation(
      () => db.insert(walletLedger).values({ ...entry, id: randomUUID() }),
      "wallet_ledger_unique_key_uq",
    );
  });

  it("rejects a second run with the same client request id for one owner", async () => {
    const userId = await insertUser();
    const conversationId = randomUUID();
    const branchId = randomUUID();
    await db.insert(conversations).values({ id: conversationId, ownerUserId: userId });
    await db.insert(branches).values({ id: branchId, conversationId });

    const run = {
      id: randomUUID(),
      ownerUserId: userId,
      branchId,
      snapshotDigest: "digest-1",
      modelId: "deepseek-flash",
      tariffVersion: "tariff-1",
      state: "reserved",
      clientRequestId: "client-request-1",
      capPoints: 10,
    };
    await db.insert(generationRuns).values(run);
    await expectConstraintViolation(
      () => db.insert(generationRuns).values({ ...run, id: randomUUID() }),
      "generation_runs_client_request_uq",
    );
  });

  it("rejects a generation cost above the frozen cap", async () => {
    const userId = await insertUser();
    const conversationId = randomUUID();
    const branchId = randomUUID();
    await db.insert(conversations).values({ id: conversationId, ownerUserId: userId });
    await db.insert(branches).values({ id: branchId, conversationId });

    await expectConstraintViolation(
      () =>
        db.insert(generationRuns).values({
          id: randomUUID(),
          ownerUserId: userId,
          branchId,
          snapshotDigest: "digest-2",
          modelId: "deepseek-flash",
          tariffVersion: "tariff-1",
          state: "reserved",
          clientRequestId: "client-request-2",
          capPoints: 10,
          costPoints: 11,
        }),
      "generation_runs_cost_within_cap",
    );
  });
});
