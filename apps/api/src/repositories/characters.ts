import { randomUUID } from "node:crypto";

import type { CharacterPayloadDto } from "@xuyueji/contracts";
import { NotFoundError, VersionConflictError } from "@xuyueji/domain";
import { and, desc, eq, isNull } from "drizzle-orm";

import type { Database } from "../db/client.js";
import { characters, characterVersions } from "../db/schema.js";
import { toIso } from "../time.js";
import { enqueueSyncChange } from "./sync-log.js";

export type CharacterRow = typeof characters.$inferSelect;
export type CharacterVersionRow = typeof characterVersions.$inferSelect;

export interface CharacterSummary {
  readonly id: string;
  readonly activeVersionId: string | null;
  readonly revision: number;
  readonly name: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export function toCharacterSummary(
  character: CharacterRow,
  activeVersion: CharacterVersionRow | undefined,
): CharacterSummary {
  const payload = activeVersion?.payloadJsonb as { name?: unknown } | undefined;
  return {
    id: character.id,
    activeVersionId: character.activeVersionId,
    revision: activeVersion?.revision ?? 0,
    name: typeof payload?.name === "string" ? payload.name : "未命名角色",
    updatedAt: toIso(character.updatedAt),
    deletedAt: character.deletedAt ? toIso(character.deletedAt) : null,
  };
}

export async function listCharacters(
  db: Database,
  ownerUserId: string,
): Promise<CharacterSummary[]> {
  const rows = await db
    .select({ character: characters, version: characterVersions })
    .from(characters)
    .leftJoin(characterVersions, eq(characterVersions.id, characters.activeVersionId))
    .where(and(eq(characters.ownerUserId, ownerUserId), isNull(characters.deletedAt)))
    .orderBy(desc(characters.updatedAt));

  return rows.map((row) => toCharacterSummary(row.character, row.version ?? undefined));
}

export async function getCharacter(
  db: Database,
  ownerUserId: string,
  characterId: string,
): Promise<{
  character: CharacterRow;
  versions: CharacterVersionRow[];
}> {
  const [character] = await db
    .select()
    .from(characters)
    .where(
      and(
        eq(characters.id, characterId),
        eq(characters.ownerUserId, ownerUserId),
        isNull(characters.deletedAt),
      ),
    )
    .limit(1);

  if (!character) {
    throw new NotFoundError("Character not found.", { characterId });
  }

  const versions = await db
    .select()
    .from(characterVersions)
    .where(eq(characterVersions.characterId, characterId))
    .orderBy(desc(characterVersions.revision));

  return { character, versions };
}

export async function createCharacter(
  db: Database,
  input: {
    readonly ownerUserId: string;
    readonly payload: CharacterPayloadDto;
    readonly sourceFormat: "native" | "v2" | "v3";
    readonly now: string;
  },
): Promise<{ character: CharacterRow; version: CharacterVersionRow }> {
  const characterId = randomUUID();
  const versionId = randomUUID();

  return db.transaction(async (tx) => {
    const [character] = await tx
      .insert(characters)
      .values({
        id: characterId,
        ownerUserId: input.ownerUserId,
        activeVersionId: versionId,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    if (!character) {
      throw new Error("Character insert returned no row.");
    }

    const [version] = await tx
      .insert(characterVersions)
      .values({
        id: versionId,
        characterId,
        ownerUserId: input.ownerUserId,
        revision: 1,
        sourceFormat: input.sourceFormat,
        payloadJsonb: input.payload,
        createdAt: input.now,
      })
      .returning();
    if (!version) {
      throw new Error("Character version insert returned no row.");
    }

    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "character",
      entityId: characterId,
      revision: 1,
      op: "upsert",
    });

    return { character, version };
  });
}

export async function addCharacterVersion(
  db: Database,
  input: {
    readonly ownerUserId: string;
    readonly characterId: string;
    readonly expectedActiveVersionId: string;
    readonly payload: CharacterPayloadDto;
    readonly sourceFormat: "native" | "v2" | "v3";
    readonly now: string;
  },
): Promise<{ character: CharacterRow; version: CharacterVersionRow }> {
  return db.transaction(async (tx) => {
    const [character] = await tx
      .select()
      .from(characters)
      .where(
        and(
          eq(characters.id, input.characterId),
          eq(characters.ownerUserId, input.ownerUserId),
          isNull(characters.deletedAt),
        ),
      )
      .for("update")
      .limit(1);

    if (!character) {
      throw new NotFoundError("Character not found.", { characterId: input.characterId });
    }
    if (character.activeVersionId !== input.expectedActiveVersionId) {
      throw new VersionConflictError("Character was edited on another device.", {
        characterId: character.id,
        expectedActiveVersionId: input.expectedActiveVersionId,
        actualActiveVersionId: character.activeVersionId,
      });
    }

    const [latest] = await tx
      .select({ revision: characterVersions.revision })
      .from(characterVersions)
      .where(eq(characterVersions.characterId, character.id))
      .orderBy(desc(characterVersions.revision))
      .limit(1);

    const revision = (latest?.revision ?? 0) + 1;
    const versionId = randomUUID();

    const [version] = await tx
      .insert(characterVersions)
      .values({
        id: versionId,
        characterId: character.id,
        ownerUserId: input.ownerUserId,
        revision,
        sourceFormat: input.sourceFormat,
        payloadJsonb: input.payload,
        createdAt: input.now,
      })
      .returning();
    if (!version) {
      throw new Error("Character version insert returned no row.");
    }

    const [updated] = await tx
      .update(characters)
      .set({ activeVersionId: versionId, updatedAt: input.now })
      .where(eq(characters.id, character.id))
      .returning();
    if (!updated) {
      throw new Error("Character update returned no row.");
    }

    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "character",
      entityId: character.id,
      revision,
      op: "upsert",
    });

    return { character: updated, version };
  });
}

export async function deleteCharacter(
  db: Database,
  input: {
    readonly ownerUserId: string;
    readonly characterId: string;
    readonly now: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [character] = await tx
      .select()
      .from(characters)
      .where(
        and(
          eq(characters.id, input.characterId),
          eq(characters.ownerUserId, input.ownerUserId),
          isNull(characters.deletedAt),
        ),
      )
      .for("update")
      .limit(1);

    if (!character) {
      throw new NotFoundError("Character not found.", { characterId: input.characterId });
    }

    await tx
      .update(characters)
      .set({ deletedAt: input.now, updatedAt: input.now })
      .where(eq(characters.id, character.id));

    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "character",
      entityId: character.id,
      revision: 1,
      op: "delete",
    });
  });
}
