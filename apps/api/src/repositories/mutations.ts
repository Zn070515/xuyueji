import { randomUUID } from "node:crypto";

import type { SyncMutationEnvelope, SyncMutationResult } from "@xuyueji/contracts";
import { compileSafeRegex } from "@xuyueji/tavern-core";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "../db/client.js";
import {
  conversations,
  lorebooks,
  memoryItems,
  personas,
  personaVersions,
  presets,
  regexRules,
  syncMutations,
} from "../db/schema.js";
import { enqueueSyncChange, type Transaction } from "./sync-log.js";

type Mutation = SyncMutationEnvelope["mutations"][number];

const presetPayloadSchema = z
  .object({
    title: z.string().min(1).max(120),
    payload: z.record(z.string(), z.unknown()),
    enabled: z.boolean().optional(),
  })
  .strict();

const lorebookPayloadSchema = z
  .object({
    title: z.string().min(1).max(120),
  })
  .strict();

const regexPayloadSchema = z
  .object({
    title: z.string().min(1).max(120),
    stage: z.enum(["user_input", "prompt_build", "model_output", "display_only"]),
    pattern: z.string().min(1).max(2_000),
    flags: z.string().max(10).optional(),
    replacement: z.string().max(10_000).optional(),
    sortOrder: z.number().int().nonnegative().optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

const memoryPayloadSchema = z
  .object({
    kind: z.enum(["manual_fact", "event", "summary", "relationship", "retrieval_hit"]),
    content: z.string().min(1).max(100_000),
    conversationId: z.uuid().nullable().optional(),
    scope: z.string().min(1).max(50).optional(),
    locked: z.boolean().optional(),
  })
  .strict();

const personaPayloadSchema = z
  .object({
    displayName: z.string().min(1).max(120),
    description: z.string().max(50_000),
  })
  .strict();

function rejected(opId: string, code: string, message: string): SyncMutationResult {
  return { opId, status: "rejected", code, message };
}

function conflict(opId: string, message: string): SyncMutationResult {
  return { opId, status: "conflict", code: "VERSION_CONFLICT", message };
}

function accepted(opId: string, newRevision: number): SyncMutationResult {
  return { opId, status: "accepted", newRevision };
}

async function upsertPersona(
  tx: Transaction,
  ownerUserId: string,
  mutation: Mutation,
  now: string,
): Promise<SyncMutationResult> {
  if (mutation.action === "delete") {
    if (mutation.expectedRevision === null) {
      return rejected(mutation.opId, "INVALID_PAYLOAD", "Delete requires expectedRevision.");
    }
    const [persona] = await tx
      .select()
      .from(personas)
      .where(
        and(
          eq(personas.id, mutation.entityId),
          eq(personas.ownerUserId, ownerUserId),
          isNull(personas.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!persona) {
      return rejected(mutation.opId, "NOT_FOUND", "Persona not found.");
    }
    const [active] = await tx
      .select()
      .from(personaVersions)
      .where(eq(personaVersions.id, persona.activeVersionId ?? ""))
      .limit(1);
    if (!active || active.revision !== mutation.expectedRevision) {
      return conflict(mutation.opId, "Persona changed on another device.");
    }
    await tx
      .update(personas)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(personas.id, persona.id));
    await enqueueSyncChange(tx, {
      ownerUserId,
      entityType: "persona",
      entityId: persona.id,
      revision: active.revision,
      op: "delete",
    });
    return accepted(mutation.opId, active.revision);
  }

  const payload = personaPayloadSchema.safeParse(mutation.payload);
  if (!payload.success) {
    return rejected(mutation.opId, "INVALID_PAYLOAD", "Persona payload is invalid.");
  }

  if (mutation.expectedRevision === null) {
    const [existing] = await tx
      .select({ id: personas.id })
      .from(personas)
      .where(and(eq(personas.id, mutation.entityId), eq(personas.ownerUserId, ownerUserId)))
      .limit(1);
    if (existing) {
      return conflict(mutation.opId, "Persona id already exists.");
    }
    const versionId = randomUUID();
    await tx.insert(personas).values({
      id: mutation.entityId,
      ownerUserId,
      activeVersionId: versionId,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(personaVersions).values({
      id: versionId,
      personaId: mutation.entityId,
      ownerUserId,
      revision: 1,
      payloadJsonb: payload.data,
      createdAt: now,
    });
    await enqueueSyncChange(tx, {
      ownerUserId,
      entityType: "persona",
      entityId: mutation.entityId,
      revision: 1,
      op: "upsert",
    });
    return accepted(mutation.opId, 1);
  }

  const [persona] = await tx
    .select()
    .from(personas)
    .where(
      and(
        eq(personas.id, mutation.entityId),
        eq(personas.ownerUserId, ownerUserId),
        isNull(personas.deletedAt),
      ),
    )
    .for("update")
    .limit(1);
  if (!persona) {
    return rejected(mutation.opId, "NOT_FOUND", "Persona not found.");
  }
  const [active] = await tx
    .select()
    .from(personaVersions)
    .where(eq(personaVersions.id, persona.activeVersionId ?? ""))
    .limit(1);
  if (!active || active.revision !== mutation.expectedRevision) {
    return conflict(mutation.opId, "Persona changed on another device.");
  }
  const revision = active.revision + 1;
  const versionId = randomUUID();
  await tx.insert(personaVersions).values({
    id: versionId,
    personaId: persona.id,
    ownerUserId,
    revision,
    payloadJsonb: payload.data,
    createdAt: now,
  });
  await tx
    .update(personas)
    .set({ activeVersionId: versionId, updatedAt: now })
    .where(eq(personas.id, persona.id));
  await enqueueSyncChange(tx, {
    ownerUserId,
    entityType: "persona",
    entityId: persona.id,
    revision,
    op: "upsert",
  });
  return accepted(mutation.opId, revision);
}

async function upsertPreset(
  tx: Transaction,
  ownerUserId: string,
  mutation: Mutation,
  now: string,
): Promise<SyncMutationResult> {
  if (mutation.action === "delete") {
    if (mutation.expectedRevision === null) {
      return rejected(mutation.opId, "INVALID_PAYLOAD", "Delete requires expectedRevision.");
    }
    const [row] = await tx
      .select()
      .from(presets)
      .where(
        and(
          eq(presets.id, mutation.entityId),
          eq(presets.ownerUserId, ownerUserId),
          isNull(presets.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!row) {
      return rejected(mutation.opId, "NOT_FOUND", "Preset not found.");
    }
    if (row.revision !== mutation.expectedRevision) {
      return conflict(mutation.opId, "Preset changed on another device.");
    }
    await tx.update(presets).set({ deletedAt: now, updatedAt: now }).where(eq(presets.id, row.id));
    await enqueueSyncChange(tx, {
      ownerUserId,
      entityType: "preset",
      entityId: row.id,
      revision: row.revision,
      op: "delete",
    });
    return accepted(mutation.opId, row.revision);
  }

  const payload = presetPayloadSchema.safeParse(mutation.payload);
  if (!payload.success) {
    return rejected(mutation.opId, "INVALID_PAYLOAD", "Preset payload is invalid.");
  }

  if (mutation.expectedRevision === null) {
    const [existing] = await tx
      .select({ id: presets.id })
      .from(presets)
      .where(and(eq(presets.id, mutation.entityId), eq(presets.ownerUserId, ownerUserId)))
      .limit(1);
    if (existing) {
      return conflict(mutation.opId, "Preset id already exists.");
    }
    await tx.insert(presets).values({
      id: mutation.entityId,
      ownerUserId,
      title: payload.data.title,
      revision: 1,
      payloadJsonb: payload.data.payload,
      enabled: payload.data.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    });
    await enqueueSyncChange(tx, {
      ownerUserId,
      entityType: "preset",
      entityId: mutation.entityId,
      revision: 1,
      op: "upsert",
    });
    return accepted(mutation.opId, 1);
  }

  const [row] = await tx
    .select()
    .from(presets)
    .where(
      and(
        eq(presets.id, mutation.entityId),
        eq(presets.ownerUserId, ownerUserId),
        isNull(presets.deletedAt),
      ),
    )
    .for("update")
    .limit(1);
  if (!row) {
    return rejected(mutation.opId, "NOT_FOUND", "Preset not found.");
  }
  if (row.revision !== mutation.expectedRevision) {
    return conflict(mutation.opId, "Preset changed on another device.");
  }
  const revision = row.revision + 1;
  await tx
    .update(presets)
    .set({
      title: payload.data.title,
      payloadJsonb: payload.data.payload,
      enabled: payload.data.enabled ?? row.enabled,
      revision,
      updatedAt: now,
    })
    .where(eq(presets.id, row.id));
  await enqueueSyncChange(tx, {
    ownerUserId,
    entityType: "preset",
    entityId: row.id,
    revision,
    op: "upsert",
  });
  return accepted(mutation.opId, revision);
}

async function upsertLorebook(
  tx: Transaction,
  ownerUserId: string,
  mutation: Mutation,
  now: string,
): Promise<SyncMutationResult> {
  if (mutation.action === "delete") {
    if (mutation.expectedRevision === null) {
      return rejected(mutation.opId, "INVALID_PAYLOAD", "Delete requires expectedRevision.");
    }
    const [row] = await tx
      .select()
      .from(lorebooks)
      .where(
        and(
          eq(lorebooks.id, mutation.entityId),
          eq(lorebooks.ownerUserId, ownerUserId),
          isNull(lorebooks.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!row) {
      return rejected(mutation.opId, "NOT_FOUND", "Lorebook not found.");
    }
    if (row.revision !== mutation.expectedRevision) {
      return conflict(mutation.opId, "Lorebook changed on another device.");
    }
    await tx
      .update(lorebooks)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(lorebooks.id, row.id));
    await enqueueSyncChange(tx, {
      ownerUserId,
      entityType: "lorebook",
      entityId: row.id,
      revision: row.revision,
      op: "delete",
    });
    return accepted(mutation.opId, row.revision);
  }

  const payload = lorebookPayloadSchema.safeParse(mutation.payload);
  if (!payload.success) {
    return rejected(mutation.opId, "INVALID_PAYLOAD", "Lorebook payload is invalid.");
  }

  if (mutation.expectedRevision === null) {
    const [existing] = await tx
      .select({ id: lorebooks.id })
      .from(lorebooks)
      .where(and(eq(lorebooks.id, mutation.entityId), eq(lorebooks.ownerUserId, ownerUserId)))
      .limit(1);
    if (existing) {
      return conflict(mutation.opId, "Lorebook id already exists.");
    }
    await tx.insert(lorebooks).values({
      id: mutation.entityId,
      ownerUserId,
      title: payload.data.title,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });
    await enqueueSyncChange(tx, {
      ownerUserId,
      entityType: "lorebook",
      entityId: mutation.entityId,
      revision: 1,
      op: "upsert",
    });
    return accepted(mutation.opId, 1);
  }

  const [row] = await tx
    .select()
    .from(lorebooks)
    .where(
      and(
        eq(lorebooks.id, mutation.entityId),
        eq(lorebooks.ownerUserId, ownerUserId),
        isNull(lorebooks.deletedAt),
      ),
    )
    .for("update")
    .limit(1);
  if (!row) {
    return rejected(mutation.opId, "NOT_FOUND", "Lorebook not found.");
  }
  if (row.revision !== mutation.expectedRevision) {
    return conflict(mutation.opId, "Lorebook changed on another device.");
  }
  const revision = row.revision + 1;
  await tx
    .update(lorebooks)
    .set({ title: payload.data.title, revision, updatedAt: now })
    .where(eq(lorebooks.id, row.id));
  await enqueueSyncChange(tx, {
    ownerUserId,
    entityType: "lorebook",
    entityId: row.id,
    revision,
    op: "upsert",
  });
  return accepted(mutation.opId, revision);
}

async function upsertRegexRule(
  tx: Transaction,
  ownerUserId: string,
  mutation: Mutation,
  now: string,
): Promise<SyncMutationResult> {
  if (mutation.action === "delete") {
    if (mutation.expectedRevision === null) {
      return rejected(mutation.opId, "INVALID_PAYLOAD", "Delete requires expectedRevision.");
    }
    const [row] = await tx
      .select()
      .from(regexRules)
      .where(
        and(
          eq(regexRules.id, mutation.entityId),
          eq(regexRules.ownerUserId, ownerUserId),
          isNull(regexRules.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!row) {
      return rejected(mutation.opId, "NOT_FOUND", "Regex rule not found.");
    }
    if (row.revision !== mutation.expectedRevision) {
      return conflict(mutation.opId, "Regex rule changed on another device.");
    }
    await tx
      .update(regexRules)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(regexRules.id, row.id));
    await enqueueSyncChange(tx, {
      ownerUserId,
      entityType: "regex_rule",
      entityId: row.id,
      revision: row.revision,
      op: "delete",
    });
    return accepted(mutation.opId, row.revision);
  }

  const payload = regexPayloadSchema.safeParse(mutation.payload);
  if (!payload.success) {
    return rejected(mutation.opId, "INVALID_PAYLOAD", "Regex rule payload is invalid.");
  }
  try {
    compileSafeRegex(payload.data.pattern, payload.data.flags ?? "");
  } catch {
    return rejected(
      mutation.opId,
      "INVALID_PATTERN",
      "Regex pattern is outside the supported safe subset.",
    );
  }

  if (mutation.expectedRevision === null) {
    const [existing] = await tx
      .select({ id: regexRules.id })
      .from(regexRules)
      .where(and(eq(regexRules.id, mutation.entityId), eq(regexRules.ownerUserId, ownerUserId)))
      .limit(1);
    if (existing) {
      return conflict(mutation.opId, "Regex rule id already exists.");
    }
    await tx.insert(regexRules).values({
      id: mutation.entityId,
      ownerUserId,
      title: payload.data.title,
      revision: 1,
      stage: payload.data.stage,
      pattern: payload.data.pattern,
      flags: payload.data.flags ?? "",
      replacement: payload.data.replacement ?? "",
      sortOrder: payload.data.sortOrder ?? 0,
      enabled: payload.data.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    });
    await enqueueSyncChange(tx, {
      ownerUserId,
      entityType: "regex_rule",
      entityId: mutation.entityId,
      revision: 1,
      op: "upsert",
    });
    return accepted(mutation.opId, 1);
  }

  const [row] = await tx
    .select()
    .from(regexRules)
    .where(
      and(
        eq(regexRules.id, mutation.entityId),
        eq(regexRules.ownerUserId, ownerUserId),
        isNull(regexRules.deletedAt),
      ),
    )
    .for("update")
    .limit(1);
  if (!row) {
    return rejected(mutation.opId, "NOT_FOUND", "Regex rule not found.");
  }
  if (row.revision !== mutation.expectedRevision) {
    return conflict(mutation.opId, "Regex rule changed on another device.");
  }
  const revision = row.revision + 1;
  await tx
    .update(regexRules)
    .set({
      title: payload.data.title,
      stage: payload.data.stage,
      pattern: payload.data.pattern,
      flags: payload.data.flags ?? row.flags,
      replacement: payload.data.replacement ?? row.replacement,
      sortOrder: payload.data.sortOrder ?? row.sortOrder,
      enabled: payload.data.enabled ?? row.enabled,
      revision,
      updatedAt: now,
    })
    .where(eq(regexRules.id, row.id));
  await enqueueSyncChange(tx, {
    ownerUserId,
    entityType: "regex_rule",
    entityId: row.id,
    revision,
    op: "upsert",
  });
  return accepted(mutation.opId, revision);
}

async function upsertMemoryItem(
  tx: Transaction,
  ownerUserId: string,
  mutation: Mutation,
  now: string,
): Promise<SyncMutationResult> {
  if (mutation.action === "delete") {
    if (mutation.expectedRevision === null) {
      return rejected(mutation.opId, "INVALID_PAYLOAD", "Delete requires expectedRevision.");
    }
    const [row] = await tx
      .select()
      .from(memoryItems)
      .where(
        and(
          eq(memoryItems.id, mutation.entityId),
          eq(memoryItems.ownerUserId, ownerUserId),
          isNull(memoryItems.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!row) {
      return rejected(mutation.opId, "NOT_FOUND", "Memory item not found.");
    }
    if (row.revision !== mutation.expectedRevision) {
      return conflict(mutation.opId, "Memory item changed on another device.");
    }
    await tx
      .update(memoryItems)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(memoryItems.id, row.id));
    await enqueueSyncChange(tx, {
      ownerUserId,
      entityType: "memory_item",
      entityId: row.id,
      revision: row.revision,
      op: "delete",
    });
    return accepted(mutation.opId, row.revision);
  }

  const payload = memoryPayloadSchema.safeParse(mutation.payload);
  if (!payload.success) {
    return rejected(mutation.opId, "INVALID_PAYLOAD", "Memory payload is invalid.");
  }
  if (payload.data.conversationId) {
    const [conversation] = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, payload.data.conversationId),
          eq(conversations.ownerUserId, ownerUserId),
        ),
      )
      .limit(1);
    if (!conversation) {
      return rejected(mutation.opId, "NOT_FOUND", "Conversation not found.");
    }
  }

  if (mutation.expectedRevision === null) {
    const [existing] = await tx
      .select({ id: memoryItems.id })
      .from(memoryItems)
      .where(and(eq(memoryItems.id, mutation.entityId), eq(memoryItems.ownerUserId, ownerUserId)))
      .limit(1);
    if (existing) {
      return conflict(mutation.opId, "Memory item id already exists.");
    }
    await tx.insert(memoryItems).values({
      id: mutation.entityId,
      ownerUserId,
      conversationId: payload.data.conversationId ?? null,
      kind: payload.data.kind,
      content: payload.data.content,
      scope: payload.data.scope ?? "conversation",
      locked: payload.data.locked ?? false,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });
    await enqueueSyncChange(tx, {
      ownerUserId,
      entityType: "memory_item",
      entityId: mutation.entityId,
      revision: 1,
      op: "upsert",
    });
    return accepted(mutation.opId, 1);
  }

  const [row] = await tx
    .select()
    .from(memoryItems)
    .where(
      and(
        eq(memoryItems.id, mutation.entityId),
        eq(memoryItems.ownerUserId, ownerUserId),
        isNull(memoryItems.deletedAt),
      ),
    )
    .for("update")
    .limit(1);
  if (!row) {
    return rejected(mutation.opId, "NOT_FOUND", "Memory item not found.");
  }
  if (row.revision !== mutation.expectedRevision) {
    return conflict(mutation.opId, "Memory item changed on another device.");
  }
  const revision = row.revision + 1;
  await tx
    .update(memoryItems)
    .set({
      conversationId: payload.data.conversationId ?? row.conversationId,
      kind: payload.data.kind,
      content: payload.data.content,
      scope: payload.data.scope ?? row.scope,
      locked: payload.data.locked ?? row.locked,
      revision,
      updatedAt: now,
    })
    .where(eq(memoryItems.id, row.id));
  await enqueueSyncChange(tx, {
    ownerUserId,
    entityType: "memory_item",
    entityId: row.id,
    revision,
    op: "upsert",
  });
  return accepted(mutation.opId, revision);
}

async function executeMutation(
  tx: Transaction,
  ownerUserId: string,
  mutation: Mutation,
  now: string,
): Promise<SyncMutationResult> {
  switch (mutation.entityType) {
    case "persona":
      return upsertPersona(tx, ownerUserId, mutation, now);
    case "preset":
      return upsertPreset(tx, ownerUserId, mutation, now);
    case "lorebook":
      return upsertLorebook(tx, ownerUserId, mutation, now);
    case "regex_rule":
      return upsertRegexRule(tx, ownerUserId, mutation, now);
    case "memory_item":
      return upsertMemoryItem(tx, ownerUserId, mutation, now);
    default:
      return rejected(mutation.opId, "UNSUPPORTED_ENTITY", "Unsupported entity type.");
  }
}

export async function applyMutations(
  db: Database,
  ownerUserId: string,
  mutations: readonly Mutation[],
): Promise<SyncMutationResult[]> {
  const results: SyncMutationResult[] = [];
  const now = new Date().toISOString();

  for (const mutation of mutations) {
    const result = await db.transaction(async (tx) => {
      const [receipt] = await tx
        .insert(syncMutations)
        .values({
          id: randomUUID(),
          ownerUserId,
          opId: mutation.opId,
          entityType: mutation.entityType,
          entityId: mutation.entityId,
          resultJsonb: null,
        })
        .onConflictDoNothing()
        .returning();

      if (!receipt) {
        const [existing] = await tx
          .select()
          .from(syncMutations)
          .where(
            and(eq(syncMutations.ownerUserId, ownerUserId), eq(syncMutations.opId, mutation.opId)),
          )
          .limit(1);
        if (existing?.resultJsonb) {
          return existing.resultJsonb as unknown as SyncMutationResult;
        }
        return rejected(mutation.opId, "DUPLICATE_OP", "Operation is already being processed.");
      }

      const outcome = await executeMutation(tx, ownerUserId, mutation, now);
      await tx
        .update(syncMutations)
        .set({ resultJsonb: outcome as unknown as Record<string, unknown> })
        .where(eq(syncMutations.id, receipt.id));
      return outcome;
    });

    results.push(result);
  }

  return results;
}
