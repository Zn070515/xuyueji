import { ForbiddenError, InvariantViolationError, VersionConflictError } from "./errors.js";
import type { CharacterId, CharacterVersionId, UserId } from "./ids.js";

export type CharacterSourceFormat = "native" | "v2" | "v3";

/**
 * The canonical character payload. Unknown extension fields are retained under
 * `extensions` so a compat import can round-trip data this version does not
 * understand yet.
 */
export interface CharacterPayload {
  readonly name: string;
  readonly description: string;
  readonly personality?: string;
  readonly scenario?: string;
  readonly firstMessage?: string;
  readonly alternateGreetings?: readonly string[];
  readonly exampleMessages?: readonly string[];
  readonly systemPrompt?: string;
  readonly postHistoryInstructions?: string;
  readonly tags?: readonly string[];
  readonly creatorNotes?: string;
  readonly extensions?: Readonly<Record<string, unknown>>;
  readonly avatarAssetId?: string;
}

export interface CharacterVersion {
  readonly id: CharacterVersionId;
  readonly characterId: CharacterId;
  readonly ownerId: UserId;
  readonly revision: number;
  readonly sourceFormat: CharacterSourceFormat;
  readonly createdAt: string;
  readonly payload: CharacterPayload;
}

/**
 * A character is an immutable version chain plus an `activeVersionId` pointer.
 * Generation runs bind to an exact version id; later edits never mutate the
 * version that a running generation resolved.
 */
export interface Character {
  readonly id: CharacterId;
  readonly ownerId: UserId;
  readonly activeVersionId: CharacterVersionId;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly versions: readonly CharacterVersion[];
}

export interface CreateCharacterInput {
  readonly id: CharacterId;
  readonly ownerId: UserId;
  readonly versionId: CharacterVersionId;
  readonly payload: CharacterPayload;
  readonly sourceFormat?: CharacterSourceFormat;
  readonly createdAt: string;
}

export interface AddCharacterVersionInput {
  readonly expectedActiveVersionId: CharacterVersionId;
  readonly versionId: CharacterVersionId;
  readonly payload: CharacterPayload;
  readonly sourceFormat?: CharacterSourceFormat;
  readonly createdAt: string;
}

export function createCharacter(input: CreateCharacterInput): {
  character: Character;
  version: CharacterVersion;
} {
  const characterId = input.id;
  const version: CharacterVersion = {
    id: input.versionId,
    characterId,
    ownerId: input.ownerId,
    revision: 1,
    sourceFormat: input.sourceFormat ?? "native",
    createdAt: input.createdAt,
    payload: input.payload,
  };

  const character: Character = {
    id: characterId,
    ownerId: input.ownerId,
    activeVersionId: version.id,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    versions: [version],
  };

  return { character, version };
}

/**
 * Compare-and-swap the active version pointer.
 *
 * A stale editor must not silently overwrite a newer edit. The caller receives
 * a VersionConflictError and keeps its local draft; the store is unchanged
 * because this function is pure.
 */
export function addCharacterVersion(
  character: Character,
  input: AddCharacterVersionInput,
): { character: Character; version: CharacterVersion } {
  if (input.expectedActiveVersionId !== character.activeVersionId) {
    throw new VersionConflictError("Character was edited on another device.", {
      characterId: character.id,
      expectedActiveVersionId: input.expectedActiveVersionId,
      actualActiveVersionId: character.activeVersionId,
    });
  }

  if (character.versions.some((version) => version.id === input.versionId)) {
    throw new InvariantViolationError("Character version id must be unique.", {
      characterId: character.id,
      versionId: input.versionId,
    });
  }

  const revision =
    character.versions.reduce((highest, version) => Math.max(highest, version.revision), 0) + 1;

  const version: CharacterVersion = {
    id: input.versionId,
    characterId: character.id,
    ownerId: character.ownerId,
    revision,
    sourceFormat: input.sourceFormat ?? "native",
    createdAt: input.createdAt,
    payload: input.payload,
  };

  return {
    version,
    character: {
      ...character,
      activeVersionId: version.id,
      updatedAt: input.createdAt,
      versions: [...character.versions, version],
    },
  };
}

export function requireCharacterOwner(character: Character, userId: UserId): void {
  if (character.ownerId !== userId) {
    throw new ForbiddenError("Character belongs to another user.", {
      characterId: character.id,
    });
  }
}

export function findCharacterVersion(
  character: Character,
  versionId: CharacterVersionId,
): CharacterVersion | undefined {
  return character.versions.find((version) => version.id === versionId);
}
