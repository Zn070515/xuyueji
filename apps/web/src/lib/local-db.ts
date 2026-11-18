import Dexie, { type EntityTable } from "dexie";

/**
 * Browser-local cache only. M0 stores a chat draft to prove the boundary:
 * IndexedDB is never the authority and never holds payment credentials or API
 * keys. The server-side PostgreSQL store arrives in M1.
 */
export interface LocalDraft {
  readonly id: string;
  readonly conversationId: string;
  readonly content: string;
  readonly updatedAt: string;
}

export type OutboxState = "pending" | "syncing" | "accepted" | "conflict" | "failed";

export interface OutboxItem {
  readonly id: string;
  readonly opId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: "upsert" | "delete";
  readonly expectedRevision: number | null;
  readonly payload: unknown;
  readonly createdAt: string;
  readonly attempts: number;
  readonly state: OutboxState;
  readonly lastError: string | null;
}

class XuyuejiLocalDatabase extends Dexie {
  drafts!: EntityTable<LocalDraft, "id">;
  outbox!: EntityTable<OutboxItem, "id">;

  constructor() {
    super("xuyueji-local");
    this.version(1).stores({
      drafts: "id, conversationId, updatedAt",
    });
    this.version(2).stores({
      outbox: "id, opId, state, createdAt",
    });
  }
}

export const localDb = new XuyuejiLocalDatabase();

export async function loadDraft(conversationId: string): Promise<LocalDraft | undefined> {
  return localDb.drafts.where("conversationId").equals(conversationId).last();
}

export async function saveDraft(conversationId: string, content: string): Promise<void> {
  await localDb.drafts.put({
    id: `draft_${conversationId}`,
    conversationId,
    content,
    updatedAt: new Date().toISOString(),
  });
}
