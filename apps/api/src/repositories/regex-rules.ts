import { randomUUID } from "node:crypto";

import type { RegexRuleDto, RegexStage } from "@xuyueji/contracts";
import { NotFoundError, VersionConflictError } from "@xuyueji/domain";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { Database } from "../db/client.js";
import { regexRules } from "../db/schema.js";
import { toIso } from "../time.js";
import { enqueueSyncChange } from "./sync-log.js";

export type RegexRuleRow = typeof regexRules.$inferSelect;

function toDto(row: RegexRuleRow): RegexRuleDto {
  return {
    id: row.id,
    title: row.title,
    stage: row.stage as RegexStage,
    pattern: row.pattern,
    flags: row.flags,
    replacement: row.replacement,
    sortOrder: row.sortOrder,
    enabled: row.enabled,
    revision: row.revision,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export async function listRegexRules(db: Database, ownerUserId: string): Promise<RegexRuleDto[]> {
  const rows = await db
    .select()
    .from(regexRules)
    .where(and(eq(regexRules.ownerUserId, ownerUserId), isNull(regexRules.deletedAt)))
    .orderBy(asc(regexRules.sortOrder), asc(regexRules.createdAt));
  return rows.map(toDto);
}

export async function listRegexRulesByIds(
  db: Database,
  ownerUserId: string,
  ids: readonly string[],
): Promise<RegexRuleDto[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await db
    .select()
    .from(regexRules)
    .where(
      and(
        eq(regexRules.ownerUserId, ownerUserId),
        inArray(regexRules.id, [...ids]),
        isNull(regexRules.deletedAt),
      ),
    )
    .orderBy(asc(regexRules.sortOrder), asc(regexRules.createdAt));
  return rows.map(toDto);
}

export async function getRegexRule(
  db: Database,
  ownerUserId: string,
  ruleId: string,
): Promise<RegexRuleDto> {
  const [row] = await db
    .select()
    .from(regexRules)
    .where(
      and(
        eq(regexRules.id, ruleId),
        eq(regexRules.ownerUserId, ownerUserId),
        isNull(regexRules.deletedAt),
      ),
    )
    .limit(1);
  if (!row) {
    throw new NotFoundError("Regex rule not found.", { ruleId });
  }
  return toDto(row);
}

export async function createRegexRule(
  db: Database,
  input: {
    ownerUserId: string;
    title: string;
    stage: RegexStage;
    pattern: string;
    flags: string;
    replacement: string;
    sortOrder: number;
    enabled: boolean;
    now: string;
  },
): Promise<RegexRuleDto> {
  const id = randomUUID();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(regexRules)
      .values({
        id,
        ownerUserId: input.ownerUserId,
        title: input.title,
        revision: 1,
        stage: input.stage,
        pattern: input.pattern,
        flags: input.flags,
        replacement: input.replacement,
        sortOrder: input.sortOrder,
        enabled: input.enabled,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    if (!row) {
      throw new Error("Regex rule insert returned no row.");
    }
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "regex_rule",
      entityId: id,
      revision: 1,
      op: "upsert",
    });
    return toDto(row);
  });
}

export async function updateRegexRule(
  db: Database,
  input: {
    ownerUserId: string;
    ruleId: string;
    title: string;
    stage: RegexStage;
    pattern: string;
    flags: string;
    replacement: string;
    sortOrder: number;
    enabled: boolean;
    expectedRevision: number;
    now: string;
  },
): Promise<RegexRuleDto> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(regexRules)
      .where(
        and(
          eq(regexRules.id, input.ruleId),
          eq(regexRules.ownerUserId, input.ownerUserId),
          isNull(regexRules.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!row) {
      throw new NotFoundError("Regex rule not found.", { ruleId: input.ruleId });
    }
    if (row.revision !== input.expectedRevision) {
      throw new VersionConflictError("Regex rule changed on another device.", {
        ruleId: row.id,
        expectedRevision: input.expectedRevision,
        actualRevision: row.revision,
      });
    }
    const revision = row.revision + 1;
    const [updated] = await tx
      .update(regexRules)
      .set({
        title: input.title,
        stage: input.stage,
        pattern: input.pattern,
        flags: input.flags,
        replacement: input.replacement,
        sortOrder: input.sortOrder,
        enabled: input.enabled,
        revision,
        updatedAt: input.now,
      })
      .where(eq(regexRules.id, row.id))
      .returning();
    if (!updated) {
      throw new Error("Regex rule update returned no row.");
    }
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "regex_rule",
      entityId: row.id,
      revision,
      op: "upsert",
    });
    return toDto(updated);
  });
}

export async function deleteRegexRule(
  db: Database,
  input: { ownerUserId: string; ruleId: string; now: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(regexRules)
      .where(
        and(
          eq(regexRules.id, input.ruleId),
          eq(regexRules.ownerUserId, input.ownerUserId),
          isNull(regexRules.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!row) {
      throw new NotFoundError("Regex rule not found.", { ruleId: input.ruleId });
    }
    await tx
      .update(regexRules)
      .set({ deletedAt: input.now, updatedAt: input.now })
      .where(eq(regexRules.id, row.id));
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "regex_rule",
      entityId: row.id,
      revision: row.revision,
      op: "delete",
    });
  });
}
