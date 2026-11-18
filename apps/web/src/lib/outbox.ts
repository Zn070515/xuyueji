import { localDb, type OutboxItem, type OutboxState } from "./local-db.js";

export interface EnqueueOutboxInput {
  readonly opId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: "upsert" | "delete";
  readonly expectedRevision: number | null;
  readonly payload: unknown;
}

/**
 * Local writes are only a pending intent until the server accepts them.
 * `opId` is the idempotency key; enqueueing the same operation twice must not
 * create a second row.
 */
export async function enqueueOutbox(input: EnqueueOutboxInput): Promise<OutboxItem> {
  const existing = await localDb.outbox.where("opId").equals(input.opId).first();
  if (existing) {
    return existing;
  }

  const item: OutboxItem = {
    id: crypto.randomUUID(),
    opId: input.opId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    expectedRevision: input.expectedRevision,
    payload: input.payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    state: "pending",
    lastError: null,
  };
  await localDb.outbox.add(item);
  return item;
}

export async function listPendingOutbox(limit = 20): Promise<OutboxItem[]> {
  const rows = await localDb.outbox.where("state").equals("pending").toArray();
  return rows
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(0, Math.max(0, limit));
}

export async function markOutbox(
  id: string,
  state: OutboxState,
  lastError: string | null = null,
): Promise<void> {
  if (state === "pending") {
    await localDb.outbox.update(id, { state, lastError, attempts: 0 });
    return;
  }
  await localDb.outbox.update(id, { state, lastError });
}

export async function incrementOutboxAttempts(id: string, error: string): Promise<void> {
  const item = await localDb.outbox.get(id);
  if (!item) {
    return;
  }
  const attempts = item.attempts + 1;
  await localDb.outbox.update(id, {
    attempts,
    state: attempts >= 5 ? "failed" : "pending",
    lastError: error,
  });
}

export async function pendingOutboxCount(): Promise<number> {
  return localDb.outbox.where("state").equals("pending").count();
}

export async function clearOutboxForTests(): Promise<void> {
  await localDb.outbox.clear();
}
