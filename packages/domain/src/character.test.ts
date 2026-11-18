import { describe, expect, it } from "vitest";
import { asCharacterId, asCharacterVersionId, asUserId } from "./ids.js";
import {
  addCharacterVersion,
  createCharacter,
  ForbiddenError,
  requireCharacterOwner,
  VersionConflictError,
} from "./index.js";

const ownerId = asUserId("user_owner");
const otherUserId = asUserId("user_other");
const characterId = asCharacterId("character_demo");
const versionOneId = asCharacterVersionId("version_1");
const versionTwoId = asCharacterVersionId("version_2");
const createdAt = "2026-11-18T08:00:00.000Z";

function makeCharacter() {
  return createCharacter({
    id: characterId,
    ownerId,
    versionId: versionOneId,
    payload: { name: "星月书店店主", description: "夜色里守着一间旧书店。" },
    createdAt,
  }).character;
}

describe("character version CAS", () => {
  it("moves the active pointer when the expected version matches", () => {
    const original = makeCharacter();
    const result = addCharacterVersion(original, {
      expectedActiveVersionId: original.activeVersionId,
      versionId: versionTwoId,
      payload: { name: "星月书店店主", description: "书店在雨夜里亮着一盏灯。" },
      createdAt: "2026-11-18T09:00:00.000Z",
    });

    expect(result.version.revision).toBe(2);
    expect(result.character.activeVersionId).toBe(versionTwoId);
    expect(result.character.versions).toHaveLength(2);
    expect(original.versions).toHaveLength(1);
    expect(original.activeVersionId).toBe(versionOneId);
  });

  it("rejects a stale editor without changing the active version", () => {
    const original = makeCharacter();
    const current = addCharacterVersion(original, {
      expectedActiveVersionId: versionOneId,
      versionId: versionTwoId,
      payload: { name: "星月书店店主", description: "第二版。" },
      createdAt,
    }).character;

    expect(() =>
      addCharacterVersion(current, {
        expectedActiveVersionId: versionOneId,
        versionId: asCharacterVersionId("version_stale"),
        payload: { name: "旧设备草稿", description: "不应生效。" },
        createdAt,
      }),
    ).toThrow(VersionConflictError);

    expect(current.activeVersionId).toBe(versionTwoId);
    expect(current.versions).toHaveLength(2);
  });

  it("rejects duplicate version ids", () => {
    const original = makeCharacter();
    expect(() =>
      addCharacterVersion(original, {
        expectedActiveVersionId: versionOneId,
        versionId: versionOneId,
        payload: { name: "重复", description: "重复版本号。" },
        createdAt,
      }),
    ).toThrow(/unique/i);
  });

  it("enforces object-level ownership", () => {
    const original = makeCharacter();
    expect(() => requireCharacterOwner(original, otherUserId)).toThrow(ForbiddenError);
    expect(() => requireCharacterOwner(original, ownerId)).not.toThrow();
  });
});
