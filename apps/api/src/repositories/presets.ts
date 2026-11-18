import { randomUUID } from "node:crypto";

import {
  type PresetDetailDto,
  type PresetSectionDto,
  type PresetSummaryDto,
  presetSectionSchema,
} from "@xuyueji/contracts";
import { NotFoundError, VersionConflictError } from "@xuyueji/domain";
import { and, asc, eq, isNull } from "drizzle-orm";

import type { Database } from "../db/client.js";
import { presets } from "../db/schema.js";
import { toIso } from "../time.js";
import { enqueueSyncChange } from "./sync-log.js";

export type PresetRow = typeof presets.$inferSelect;

function parseSections(payload: Record<string, unknown>): PresetSectionDto[] {
  if (!Array.isArray(payload.sections)) {
    return [];
  }
  const sections: PresetSectionDto[] = [];
  for (const raw of payload.sections) {
    const parsed = presetSectionSchema.safeParse(raw);
    if (parsed.success) {
      sections.push(parsed.data);
    }
  }
  return sections.sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
}

function toSummary(preset: PresetRow, sections: PresetSectionDto[]): PresetSummaryDto {
  return {
    id: preset.id,
    title: preset.title,
    revision: preset.revision,
    enabled: preset.enabled,
    sectionCount: sections.length,
    updatedAt: toIso(preset.updatedAt),
  };
}

export async function listPresets(db: Database, ownerUserId: string): Promise<PresetSummaryDto[]> {
  const rows = await db
    .select()
    .from(presets)
    .where(and(eq(presets.ownerUserId, ownerUserId), isNull(presets.deletedAt)))
    .orderBy(asc(presets.createdAt));

  return rows.map((row) => toSummary(row, parseSections(row.payloadJsonb)));
}

export async function createPreset(
  db: Database,
  input: {
    ownerUserId: string;
    title: string;
    sections: PresetSectionDto[];
    enabled: boolean;
    now: string;
  },
): Promise<PresetDetailDto> {
  const id = randomUUID();
  return db.transaction(async (tx) => {
    const [preset] = await tx
      .insert(presets)
      .values({
        id,
        ownerUserId: input.ownerUserId,
        title: input.title,
        revision: 1,
        payloadJsonb: { sections: input.sections },
        enabled: input.enabled,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    if (!preset) {
      throw new Error("Preset insert returned no row.");
    }
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "preset",
      entityId: id,
      revision: 1,
      op: "upsert",
    });
    return {
      preset: toSummary(preset, input.sections),
      sections: parseSections(preset.payloadJsonb),
    };
  });
}

export async function getPreset(
  db: Database,
  ownerUserId: string,
  presetId: string,
): Promise<PresetDetailDto> {
  const [preset] = await db
    .select()
    .from(presets)
    .where(
      and(
        eq(presets.id, presetId),
        eq(presets.ownerUserId, ownerUserId),
        isNull(presets.deletedAt),
      ),
    )
    .limit(1);
  if (!preset) {
    throw new NotFoundError("Preset not found.", { presetId });
  }
  const sections = parseSections(preset.payloadJsonb);
  return { preset: toSummary(preset, sections), sections };
}

export async function updatePreset(
  db: Database,
  input: {
    ownerUserId: string;
    presetId: string;
    title: string;
    sections: PresetSectionDto[];
    enabled: boolean;
    expectedRevision: number;
    now: string;
  },
): Promise<PresetDetailDto> {
  return db.transaction(async (tx) => {
    const [preset] = await tx
      .select()
      .from(presets)
      .where(
        and(
          eq(presets.id, input.presetId),
          eq(presets.ownerUserId, input.ownerUserId),
          isNull(presets.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!preset) {
      throw new NotFoundError("Preset not found.", { presetId: input.presetId });
    }
    if (preset.revision !== input.expectedRevision) {
      throw new VersionConflictError("Preset changed on another device.", {
        presetId: preset.id,
        expectedRevision: input.expectedRevision,
        actualRevision: preset.revision,
      });
    }
    const revision = preset.revision + 1;
    const [updated] = await tx
      .update(presets)
      .set({
        title: input.title,
        revision,
        payloadJsonb: { sections: input.sections },
        enabled: input.enabled,
        updatedAt: input.now,
      })
      .where(eq(presets.id, preset.id))
      .returning();
    if (!updated) {
      throw new Error("Preset update returned no row.");
    }
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "preset",
      entityId: preset.id,
      revision,
      op: "upsert",
    });
    return {
      preset: toSummary(updated, input.sections),
      sections: parseSections(updated.payloadJsonb),
    };
  });
}

export async function deletePreset(
  db: Database,
  input: { ownerUserId: string; presetId: string; now: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [preset] = await tx
      .select()
      .from(presets)
      .where(
        and(
          eq(presets.id, input.presetId),
          eq(presets.ownerUserId, input.ownerUserId),
          isNull(presets.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!preset) {
      throw new NotFoundError("Preset not found.", { presetId: input.presetId });
    }
    await tx
      .update(presets)
      .set({ deletedAt: input.now, updatedAt: input.now })
      .where(eq(presets.id, preset.id));
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "preset",
      entityId: preset.id,
      revision: preset.revision,
      op: "delete",
    });
  });
}
