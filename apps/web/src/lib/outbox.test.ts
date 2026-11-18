import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { localDb } from "./local-db.js";
import {
  enqueueOutbox,
  incrementOutboxAttempts,
  listPendingOutbox,
  markOutbox,
  pendingOutboxCount,
} from "./outbox.js";

beforeEach(async () => {
  await localDb.delete();
  await localDb.open();
});

describe("Dexie outbox", () => {
  it("stores an operation once using opId as the idempotency key", async () => {
    const first = await enqueueOutbox({
      opId: "op-1",
      entityType: "character",
      entityId: "character-1",
      action: "upsert",
      expectedRevision: 3,
      payload: { description: "offline edit" },
    });
    const duplicate = await enqueueOutbox({
      opId: "op-1",
      entityType: "character",
      entityId: "character-1",
      action: "upsert",
      expectedRevision: 3,
      payload: { description: "offline edit" },
    });

    expect(duplicate.id).toBe(first.id);
    expect(await pendingOutboxCount()).toBe(1);
  });

  it("keeps pending work across a database reopen and accepts it once", async () => {
    const first = await enqueueOutbox({
      opId: "op-a",
      entityType: "message",
      entityId: "message-a",
      action: "upsert",
      expectedRevision: 1,
      payload: { content: "draft" },
    });
    await enqueueOutbox({
      opId: "op-b",
      entityType: "message",
      entityId: "message-b",
      action: "upsert",
      expectedRevision: 2,
      payload: { content: "second" },
    });

    localDb.close();
    await localDb.open();
    expect(await pendingOutboxCount()).toBe(2);

    await markOutbox(first.id, "accepted");
    expect(await pendingOutboxCount()).toBe(1);
    const pending = await listPendingOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.opId).toBe("op-b");
  });

  it("marks a repeatedly failing operation as failed instead of retrying forever", async () => {
    const item = await enqueueOutbox({
      opId: "op-fail",
      entityType: "conversation",
      entityId: "conversation-1",
      action: "delete",
      expectedRevision: null,
      payload: null,
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await incrementOutboxAttempts(item.id, "network down");
    }

    const stored = await localDb.outbox.get(item.id);
    expect(stored?.attempts).toBe(5);
    expect(stored?.state).toBe("failed");
    expect(await pendingOutboxCount()).toBe(0);
  });
});
