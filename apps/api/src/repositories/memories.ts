import { randomUUID } from "node:crypto";

import type { MemoryItemDto, MemoryKindDto } from "@xuyueji/contracts";
import { NotFoundError, VersionConflictError } from "@xuyueji/domain";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { Database } from "../db/client.js";
import { conversations, memoryItems } from "../db/schema.js";
import { toIso } from "../time.js";
import { enqueueSyncChange, type Transaction } from "./sync-log.js";

export type MemoryRow = typeof memoryItems.$inferSelect;

function toDto(row: MemoryRow): MemoryItemDto {
  return {
    id: row.id,
    kind: row.kind as MemoryKindDto,
    content: row.content,
    conversationId: row.conversationId,
    scope: row.scope === "global" ? "global" : "conversation",
    locked: row.locked,
    revision: row.revision,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

async function assertConversationOwned(
  db: Database | Transaction,
  ownerUserId: string,
  conversationId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.ownerUserId, ownerUserId)))
    .limit(1);
  if (!row) {
    throw new NotFoundError("Conversation not found.", { conversationId });
  }
}

export async function listMemories(
  db: Database,
  ownerUserId: string,
  conversationId?: string,
): Promise<MemoryItemDto[]> {
  const conditions = [eq(memoryItems.ownerUserId, ownerUserId), isNull(memoryItems.deletedAt)];
  if (conversationId) {
    conditions.push(eq(memoryItems.conversationId, conversationId));
  }
  const rows = await db
    .select()
    .from(memoryItems)
    .where(and(...conditions))
    .orderBy(asc(memoryItems.createdAt));
  return rows.map(toDto);
}

export async function listMemoriesByIds(
  db: Database,
  ownerUserId: string,
  ids: readonly string[],
): Promise<MemoryItemDto[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await db
    .select()
    .from(memoryItems)
    .where(
      and(
        eq(memoryItems.ownerUserId, ownerUserId),
        inArray(memoryItems.id, [...ids]),
        isNull(memoryItems.deletedAt),
      ),
    )
    .orderBy(asc(memoryItems.createdAt));
  return rows.map(toDto);
}

export async function getMemory(
  db: Database,
  ownerUserId: string,
  memoryId: string,
): Promise<MemoryItemDto> {
  const [row] = await db
    .select()
    .from(memoryItems)
    .where(
      and(
        eq(memoryItems.id, memoryId),
        eq(memoryItems.ownerUserId, ownerUserId),
        isNull(memoryItems.deletedAt),
      ),
    )
    .limit(1);
  if (!row) {
    throw new NotFoundError("Memory not found.", { memoryId });
  }
  return toDto(row);
}

export async function createMemory(
  db: Database,
  input: {
    ownerUserId: string;
    kind: MemoryKindDto;
    content: string;
    conversationId: string | null;
    scope: "conversation" | "global";
    locked: boolean;
    now: string;
  },
): Promise<MemoryItemDto> {
  const id = randomUUID();
  return db.transaction(async (tx) => {
    if (input.conversationId) {
      await assertConversationOwned(tx, input.ownerUserId, input.conversationId);
    }
    const [row] = await tx
      .insert(memoryItems)
      .values({
        id,
        ownerUserId: input.ownerUserId,
        kind: input.kind,
        content: input.content,
        conversationId: input.conversationId,
        scope: input.scope,
        locked: input.locked,
        revision: 1,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    if (!row) {
      throw new Error("Memory insert returned no row.");
    }
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "memory_item",
      entityId: id,
      revision: 1,
      op: "upsert",
    });
    return toDto(row);
  });
}

export async function updateMemory(
  db: Database,
  input: {
    ownerUserId: string;
    memoryId: string;
    kind: MemoryKindDto;
    content: string;
    conversationId: string | null | undefined;
    scope: "conversation" | "global";
    locked: boolean;
    expectedRevision: number;
    now: string;
  },
): Promise<MemoryItemDto> {
  return db.transaction(async (tx) => {
    if (input.conversationId) {
      await assertConversationOwned(tx, input.ownerUserId, input.conversationId);
    }
    const [row] = await tx
      .select()
      .from(memoryItems)
      .where(
        and(
          eq(memoryItems.id, input.memoryId),
          eq(memoryItems.ownerUserId, input.ownerUserId),
          isNull(memoryItems.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!row) {
      throw new NotFoundError("Memory not found.", { memoryId: input.memoryId });
    }
    if (row.revision !== input.expectedRevision) {
      throw new VersionConflictError("Memory changed on another device.", {
        memoryId: row.id,
        expectedRevision: input.expectedRevision,
        actualRevision: row.revision,
      });
    }
    const revision = row.revision + 1;
    const [updated] = await tx
      .update(memoryItems)
      .set({
        kind: input.kind,
        content: input.content,
        conversationId:
          input.conversationId === undefined ? row.conversationId : input.conversationId,
        scope: input.scope,
        locked: input.locked,
        revision,
        updatedAt: input.now,
      })
      .where(eq(memoryItems.id, row.id))
      .returning();
    if (!updated) {
      throw new Error("Memory update returned no row.");
    }
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "memory_item",
      entityId: row.id,
      revision,
      op: "upsert",
    });
    return toDto(updated);
  });
}

export async function deleteMemory(
  db: Database,
  input: { ownerUserId: string; memoryId: string; now: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(memoryItems)
      .where(
        and(
          eq(memoryItems.id, input.memoryId),
          eq(memoryItems.ownerUserId, input.ownerUserId),
          isNull(memoryItems.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!row) {
      throw new NotFoundError("Memory not found.", { memoryId: input.memoryId });
    }
    await tx
      .update(memoryItems)
      .set({ deletedAt: input.now, updatedAt: input.now })
      .where(eq(memoryItems.id, row.id));
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "memory_item",
      entityId: row.id,
      revision: row.revision,
      op: "delete",
    });
  });
}
