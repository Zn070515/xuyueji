import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { localDb } from "./local-db.js";
import { enqueueOutbox, pendingOutboxCount } from "./outbox.js";
import { flushOutbox } from "./outbox-sync.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(async () => {
  await localDb.delete();
  await localDb.open();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function seedTwo(): Promise<void> {
  await enqueueOutbox({
    opId: "op-ok",
    entityType: "preset",
    entityId: crypto.randomUUID(),
    action: "upsert",
    expectedRevision: null,
    payload: { title: "A", payload: {} },
  });
  await enqueueOutbox({
    opId: "op-conflict",
    entityType: "preset",
    entityId: crypto.randomUUID(),
    action: "upsert",
    expectedRevision: 3,
    payload: { title: "B", payload: {} },
  });
}

describe("outbox delivery", () => {
  it("marks accepted and conflict operations from one batch", async () => {
    await seedTwo();
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        results: [
          { opId: "op-ok", status: "accepted", newRevision: 1 },
          { opId: "op-conflict", status: "conflict", code: "VERSION_CONFLICT" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await flushOutbox();

    expect(result).toMatchObject({ accepted: 1, conflicts: 1, failed: 0, pending: 0 });
    const rows = await localDb.outbox.toArray();
    expect(rows.find((row) => row.opId === "op-ok")?.state).toBe("accepted");
    expect(rows.find((row) => row.opId === "op-conflict")?.state).toBe("conflict");

    const firstCall = fetchMock.mock.calls[0] as unknown as
      | [RequestInfo | URL, RequestInit?]
      | undefined;
    const body = JSON.parse(String(firstCall?.[1]?.body)) as {
      mutations: Array<{ opId: string }>;
    };
    expect(body.mutations.map((mutation) => mutation.opId).sort()).toEqual([
      "op-conflict",
      "op-ok",
    ]);
  });

  it("keeps retrying after a network error and stops at five attempts", async () => {
    await enqueueOutbox({
      opId: "op-network",
      entityType: "lorebook",
      entityId: crypto.randomUUID(),
      action: "upsert",
      expectedRevision: null,
      payload: { title: "网络错误" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await flushOutbox();
      expect(result.error).toBe("network down");
    }

    const [row] = await localDb.outbox.toArray();
    expect(row?.attempts).toBe(5);
    expect(row?.state).toBe("failed");
    expect(await pendingOutboxCount()).toBe(0);
  });
});
