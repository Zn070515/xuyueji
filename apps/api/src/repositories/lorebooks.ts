import { randomUUID } from "node:crypto";

import type {
  LorebookDetailDto,
  LorebookEntryDto,
  LorebookEntryInput,
  LorebookSummaryDto,
} from "@xuyueji/contracts";
import { NotFoundError, VersionConflictError } from "@xuyueji/domain";
import { and, asc, count, eq, isNull } from "drizzle-orm";

import type { Database } from "../db/client.js";
import { lorebooks, loreEntries } from "../db/schema.js";
import { toIso } from "../time.js";
import { enqueueSyncChange } from "./sync-log.js";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeRule(ruleJsonb: Record<string, unknown>): LorebookEntryDto["rule"] {
  return {
    matchMode: ruleJsonb.matchMode === "regex" ? "regex" : "keyword",
    regexPattern: typeof ruleJsonb.regexPattern === "string" ? ruleJsonb.regexPattern : "",
    regexFlags: typeof ruleJsonb.regexFlags === "string" ? ruleJsonb.regexFlags : "",
    keys: asStringArray(ruleJsonb.keys),
    secondaryKeys: asStringArray(ruleJsonb.secondaryKeys),
    caseSensitive: asBoolean(ruleJsonb.caseSensitive, false),
    constant: asBoolean(ruleJsonb.constant, false),
    probability: Math.min(1, Math.max(0, asNumber(ruleJsonb.probability, 1))),
    position:
      ruleJsonb.position === "before_char" ||
      ruleJsonb.position === "after_char" ||
      ruleJsonb.position === "before_examples" ||
      ruleJsonb.position === "after_examples" ||
      ruleJsonb.position === "at_depth"
        ? ruleJsonb.position
        : "after_char",
    scanDepth: Math.max(0, Math.floor(asNumber(ruleJsonb.scanDepth, 4))),
    recursive: asBoolean(ruleJsonb.recursive, false),
  };
}

function ruleJson(entry: LorebookEntryInput | LorebookEntryDto["rule"]): Record<string, unknown> {
  return {
    matchMode: entry.matchMode ?? "keyword",
    regexPattern: entry.regexPattern ?? "",
    regexFlags: entry.regexFlags ?? "",
    keys: entry.keys,
    secondaryKeys: entry.secondaryKeys,
    caseSensitive: entry.caseSensitive,
    constant: entry.constant,
    probability: entry.probability,
    position: entry.position,
    scanDepth: entry.scanDepth,
    recursive: entry.recursive,
  };
}

function toEntryDto(row: typeof loreEntries.$inferSelect): LorebookEntryDto {
  return {
    id: row.id,
    lorebookId: row.lorebookId,
    entryKey: row.entryKey,
    revision: row.revision,
    content: row.content,
    enabled: row.enabled,
    sortKey: row.sortKey,
    rule: normalizeRule(row.ruleJsonb),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toSummary(book: typeof lorebooks.$inferSelect, entryCount: number): LorebookSummaryDto {
  return {
    id: book.id,
    title: book.title,
    revision: book.revision,
    entryCount,
    updatedAt: toIso(book.updatedAt),
  };
}

export async function listLorebooks(
  db: Database,
  ownerUserId: string,
): Promise<LorebookSummaryDto[]> {
  const rows = await db
    .select({ book: lorebooks, entryCount: count(loreEntries.id) })
    .from(lorebooks)
    .leftJoin(
      loreEntries,
      and(eq(loreEntries.lorebookId, lorebooks.id), isNull(loreEntries.deletedAt)),
    )
    .where(and(eq(lorebooks.ownerUserId, ownerUserId), isNull(lorebooks.deletedAt)))
    .groupBy(lorebooks.id)
    .orderBy(asc(lorebooks.createdAt));

  return rows.map((row) => toSummary(row.book, Number(row.entryCount)));
}

export async function createLorebook(
  db: Database,
  input: { ownerUserId: string; title: string; now: string },
): Promise<LorebookSummaryDto> {
  const id = randomUUID();
  return db.transaction(async (tx) => {
    const [book] = await tx
      .insert(lorebooks)
      .values({
        id,
        ownerUserId: input.ownerUserId,
        title: input.title,
        revision: 1,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    if (!book) {
      throw new Error("Lorebook insert returned no row.");
    }
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "lorebook",
      entityId: id,
      revision: 1,
      op: "upsert",
    });
    return toSummary(book, 0);
  });
}

export async function getLorebook(
  db: Database,
  ownerUserId: string,
  lorebookId: string,
): Promise<LorebookDetailDto> {
  const [book] = await db
    .select()
    .from(lorebooks)
    .where(
      and(
        eq(lorebooks.id, lorebookId),
        eq(lorebooks.ownerUserId, ownerUserId),
        isNull(lorebooks.deletedAt),
      ),
    )
    .limit(1);
  if (!book) {
    throw new NotFoundError("Lorebook not found.", { lorebookId });
  }

  const entries = await db
    .select()
    .from(loreEntries)
    .where(and(eq(loreEntries.lorebookId, lorebookId), isNull(loreEntries.deletedAt)))
    .orderBy(asc(loreEntries.sortKey), asc(loreEntries.createdAt));

  return {
    lorebook: toSummary(book, entries.length),
    entries: entries.map(toEntryDto),
  };
}

export async function updateLorebook(
  db: Database,
  input: {
    ownerUserId: string;
    lorebookId: string;
    title: string;
    expectedRevision: number;
    now: string;
  },
): Promise<LorebookSummaryDto> {
  return db.transaction(async (tx) => {
    const [book] = await tx
      .select()
      .from(lorebooks)
      .where(
        and(
          eq(lorebooks.id, input.lorebookId),
          eq(lorebooks.ownerUserId, input.ownerUserId),
          isNull(lorebooks.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!book) {
      throw new NotFoundError("Lorebook not found.", { lorebookId: input.lorebookId });
    }
    if (book.revision !== input.expectedRevision) {
      throw new VersionConflictError("Lorebook changed on another device.", {
        lorebookId: book.id,
        expectedRevision: input.expectedRevision,
        actualRevision: book.revision,
      });
    }
    const revision = book.revision + 1;
    const [updated] = await tx
      .update(lorebooks)
      .set({ title: input.title, revision, updatedAt: input.now })
      .where(eq(lorebooks.id, book.id))
      .returning();
    if (!updated) {
      throw new Error("Lorebook update returned no row.");
    }
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "lorebook",
      entityId: book.id,
      revision,
      op: "upsert",
    });
    const [entryCount] = await tx
      .select({ value: count(loreEntries.id) })
      .from(loreEntries)
      .where(and(eq(loreEntries.lorebookId, book.id), isNull(loreEntries.deletedAt)));
    return toSummary(updated, Number(entryCount?.value ?? 0));
  });
}

export async function deleteLorebook(
  db: Database,
  input: { ownerUserId: string; lorebookId: string; now: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [book] = await tx
      .select()
      .from(lorebooks)
      .where(
        and(
          eq(lorebooks.id, input.lorebookId),
          eq(lorebooks.ownerUserId, input.ownerUserId),
          isNull(lorebooks.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!book) {
      throw new NotFoundError("Lorebook not found.", { lorebookId: input.lorebookId });
    }
    await tx
      .update(lorebooks)
      .set({ deletedAt: input.now, updatedAt: input.now })
      .where(eq(lorebooks.id, book.id));
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "lorebook",
      entityId: book.id,
      revision: book.revision,
      op: "delete",
    });
  });
}

export async function createLoreEntry(
  db: Database,
  input: {
    ownerUserId: string;
    lorebookId: string;
    entry: LorebookEntryInput;
    now: string;
  },
): Promise<LorebookEntryDto> {
  return db.transaction(async (tx) => {
    const [book] = await tx
      .select()
      .from(lorebooks)
      .where(
        and(
          eq(lorebooks.id, input.lorebookId),
          eq(lorebooks.ownerUserId, input.ownerUserId),
          isNull(lorebooks.deletedAt),
        ),
      )
      .limit(1);
    if (!book) {
      throw new NotFoundError("Lorebook not found.", { lorebookId: input.lorebookId });
    }

    const id = randomUUID();
    const entryKey = input.entry.entryKey ?? randomUUID();
    try {
      const [entry] = await tx
        .insert(loreEntries)
        .values({
          id,
          lorebookId: book.id,
          ownerUserId: input.ownerUserId,
          entryKey,
          revision: 1,
          ruleJsonb: ruleJson(input.entry),
          content: input.entry.content,
          enabled: input.entry.enabled,
          sortKey: input.entry.sortKey,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .returning();
      if (!entry) {
        throw new Error("Lore entry insert returned no row.");
      }
      await enqueueSyncChange(tx, {
        ownerUserId: input.ownerUserId,
        entityType: "lore_entry",
        entityId: id,
        revision: 1,
        op: "upsert",
      });
      return toEntryDto(entry);
    } catch (error) {
      const cause = (error as { cause?: { constraint?: string } }).cause;
      if (cause?.constraint === "lore_entries_key_uq") {
        throw new VersionConflictError("A lore entry with this key already exists.", {
          lorebookId: book.id,
          entryKey,
        });
      }
      throw error;
    }
  });
}

export async function updateLoreEntry(
  db: Database,
  input: {
    ownerUserId: string;
    lorebookId: string;
    entryId: string;
    expectedRevision: number;
    entry: LorebookEntryInput;
    now: string;
  },
): Promise<LorebookEntryDto> {
  return db.transaction(async (tx) => {
    const [book] = await tx
      .select()
      .from(lorebooks)
      .where(
        and(
          eq(lorebooks.id, input.lorebookId),
          eq(lorebooks.ownerUserId, input.ownerUserId),
          isNull(lorebooks.deletedAt),
        ),
      )
      .limit(1);
    if (!book) {
      throw new NotFoundError("Lorebook not found.", { lorebookId: input.lorebookId });
    }
    const [entry] = await tx
      .select()
      .from(loreEntries)
      .where(
        and(
          eq(loreEntries.id, input.entryId),
          eq(loreEntries.lorebookId, book.id),
          isNull(loreEntries.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!entry) {
      throw new NotFoundError("Lore entry not found.", { entryId: input.entryId });
    }
    if (entry.revision !== input.expectedRevision) {
      throw new VersionConflictError("Lore entry changed on another device.", {
        entryId: entry.id,
        expectedRevision: input.expectedRevision,
        actualRevision: entry.revision,
      });
    }

    const revision = entry.revision + 1;
    const [updated] = await tx
      .update(loreEntries)
      .set({
        ...(input.entry.entryKey ? { entryKey: input.entry.entryKey } : {}),
        ruleJsonb: ruleJson(input.entry),
        content: input.entry.content,
        enabled: input.entry.enabled,
        sortKey: input.entry.sortKey,
        revision,
        updatedAt: input.now,
      })
      .where(eq(loreEntries.id, entry.id))
      .returning();
    if (!updated) {
      throw new Error("Lore entry update returned no row.");
    }
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "lore_entry",
      entityId: entry.id,
      revision,
      op: "upsert",
    });
    return toEntryDto(updated);
  });
}

export async function deleteLoreEntry(
  db: Database,
  input: {
    ownerUserId: string;
    lorebookId: string;
    entryId: string;
    now: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [book] = await tx
      .select()
      .from(lorebooks)
      .where(
        and(
          eq(lorebooks.id, input.lorebookId),
          eq(lorebooks.ownerUserId, input.ownerUserId),
          isNull(lorebooks.deletedAt),
        ),
      )
      .limit(1);
    if (!book) {
      throw new NotFoundError("Lorebook not found.", { lorebookId: input.lorebookId });
    }
    const [entry] = await tx
      .select()
      .from(loreEntries)
      .where(
        and(
          eq(loreEntries.id, input.entryId),
          eq(loreEntries.lorebookId, book.id),
          isNull(loreEntries.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!entry) {
      throw new NotFoundError("Lore entry not found.", { entryId: input.entryId });
    }
    await tx
      .update(loreEntries)
      .set({ deletedAt: input.now, updatedAt: input.now })
      .where(eq(loreEntries.id, entry.id));
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "lore_entry",
      entityId: entry.id,
      revision: entry.revision,
      op: "delete",
    });
  });
}
