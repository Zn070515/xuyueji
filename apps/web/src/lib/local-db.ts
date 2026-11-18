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

class XuyuejiLocalDatabase extends Dexie {
  drafts!: EntityTable<LocalDraft, "id">;

  constructor() {
    super("xuyueji-local");
    this.version(1).stores({
      drafts: "id, conversationId, updatedAt",
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
