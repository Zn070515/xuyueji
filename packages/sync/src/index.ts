/**
 * Incremental sync protocol: opaque cursor, per-user change log, idempotent
 * mutations, CAS conflicts and tombstones.
 *
 * M0 status: contract types only. The server implementation and Dexie outbox
 * land in M1. No CRDT and no multi-user co-editing.
 */

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

export type SyncOperation = "upsert" | "delete";

export interface SyncChange {
  readonly sequence: number;
  readonly entityType: SyncEntityType;
  readonly entityId: string;
  readonly revision: number;
  readonly op: SyncOperation;
  readonly changedAt: string;
}

export interface SyncPullResponse {
  readonly changes: readonly SyncChange[];
  readonly nextCursor: string;
  readonly hasMore: boolean;
  readonly serverTime: string;
  readonly resyncRequired: boolean;
}

export interface SyncMutation {
  readonly opId: string;
  readonly entityType: SyncEntityType;
  readonly entityId: string;
  readonly expectedRevision: number | null;
  readonly action: SyncOperation;
  readonly payload: unknown;
}

export interface SyncMutationResult {
  readonly opId: string;
  readonly status: "accepted" | "conflict" | "rejected";
  readonly newRevision?: number;
  readonly code?: string;
  readonly message?: string;
}

export const SYNC_STATUS = {
  gate: "M1",
  implemented: ["contract-types"] as const,
  planned: [
    "postgres-change-log",
    "dexie-outbox",
    "cas-mutations",
    "tombstone-propagation",
    "cursor-expiry-resync",
  ],
} as const;
