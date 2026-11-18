import type { Database } from "../db/client.js";
import { syncChanges } from "../db/schema.js";

export type SyncEntityType =
  | "character"
  | "persona"
  | "lorebook"
  | "preset"
  | "regex_rule"
  | "memory_item"
  | "conversation"
  | "message"
  | "branch";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface SyncChangeInput {
  readonly ownerUserId: string;
  readonly entityType: SyncEntityType;
  readonly entityId: string;
  readonly revision: number;
  readonly op: "upsert" | "delete";
}

/**
 * Must be called inside the same transaction as the entity write. The change
 * log is the wake-up signal; the entity table remains the source of truth.
 */
export async function enqueueSyncChange(tx: Transaction, input: SyncChangeInput): Promise<void> {
  await tx.insert(syncChanges).values({
    ownerUserId: input.ownerUserId,
    entityType: input.entityType,
    entityId: input.entityId,
    revision: input.revision,
    op: input.op,
  });
}
