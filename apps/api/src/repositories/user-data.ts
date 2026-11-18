import { randomUUID } from "node:crypto";

import type { CharacterPayloadDto } from "@xuyueji/contracts";
import type { ActorRef, MessageRole } from "@xuyueji/domain";
import { and, eq, inArray, isNull } from "drizzle-orm";

import type { Database } from "../db/client.js";
import {
  branches,
  characters,
  characterVersions,
  conversations,
  lorebooks,
  loreEntries,
  memoryItems,
  messageNodes,
  personas,
  personaVersions,
  presets,
  regexRules,
  users,
} from "../db/schema.js";
import { toIso, toIsoOrNull } from "../time.js";
import { enqueueSyncChange } from "./sync-log.js";

export interface ExportManifest {
  readonly format: "xuyueji-export-json";
  readonly version: 1;
  readonly exportedAt: string;
  readonly userId: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly notes: readonly string[];
}

export interface ExportBundle {
  readonly manifest: ExportManifest;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly createdAt: string;
  };
  readonly characters: ReadonlyArray<{
    readonly id: string;
    readonly activeVersionId: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly versions: ReadonlyArray<{
      readonly id: string;
      readonly revision: number;
      readonly sourceFormat: string;
      readonly payload: CharacterPayloadDto;
      readonly createdAt: string;
    }>;
  }>;
  readonly conversations: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly mode: string;
    readonly activeBranchId: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly branches: ReadonlyArray<{
      readonly id: string;
      readonly headMessageId: string | null;
      readonly revision: number;
      readonly label: string;
      readonly createdAt: string;
    }>;
    readonly messages: ReadonlyArray<{
      readonly id: string;
      readonly parentId: string | null;
      readonly responseGroupId: string;
      readonly role: MessageRole;
      readonly actorRef: ActorRef;
      readonly content: string;
      readonly originRunId: string | null;
      readonly tombstoneAt: string | null;
      readonly createdAt: string;
    }>;
  }>;
  readonly personas: unknown[];
  readonly lorebooks: unknown[];
  readonly presets: unknown[];
  readonly regexRules: unknown[];
  readonly memoryItems: unknown[];
}

export async function exportUserData(db: Database, userId: string): Promise<ExportBundle> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.emailNormalized) {
    throw new Error("Export user is missing a login identity.");
  }

  const characterRows = await db
    .select()
    .from(characters)
    .where(and(eq(characters.ownerUserId, userId), isNull(characters.deletedAt)));
  const characterIds = characterRows.map((row) => row.id);
  const versionRows =
    characterIds.length > 0
      ? await db
          .select()
          .from(characterVersions)
          .where(inArray(characterVersions.characterId, characterIds))
      : [];

  const conversationRows = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.ownerUserId, userId), isNull(conversations.deletedAt)));
  const conversationIds = conversationRows.map((row) => row.id);
  const branchRows =
    conversationIds.length > 0
      ? await db.select().from(branches).where(inArray(branches.conversationId, conversationIds))
      : [];
  const messageRows =
    conversationIds.length > 0
      ? await db
          .select()
          .from(messageNodes)
          .where(inArray(messageNodes.conversationId, conversationIds))
      : [];

  const personaRows = await db
    .select()
    .from(personas)
    .where(and(eq(personas.ownerUserId, userId), isNull(personas.deletedAt)));
  const personaIds = personaRows.map((row) => row.id);
  const personaVersionRows =
    personaIds.length > 0
      ? await db
          .select()
          .from(personaVersions)
          .where(inArray(personaVersions.personaId, personaIds))
      : [];

  const lorebookRows = await db
    .select()
    .from(lorebooks)
    .where(and(eq(lorebooks.ownerUserId, userId), isNull(lorebooks.deletedAt)));
  const lorebookIds = lorebookRows.map((row) => row.id);
  const loreEntryRows =
    lorebookIds.length > 0
      ? await db.select().from(loreEntries).where(inArray(loreEntries.lorebookId, lorebookIds))
      : [];

  const presetRows = await db
    .select()
    .from(presets)
    .where(and(eq(presets.ownerUserId, userId), isNull(presets.deletedAt)));
  const regexRows = await db
    .select()
    .from(regexRules)
    .where(and(eq(regexRules.ownerUserId, userId), isNull(regexRules.deletedAt)));
  const memoryRows = await db
    .select()
    .from(memoryItems)
    .where(and(eq(memoryItems.ownerUserId, userId), isNull(memoryItems.deletedAt)));

  const exportedAt = new Date().toISOString();
  return {
    manifest: {
      format: "xuyueji-export-json",
      version: 1,
      exportedAt,
      userId,
      counts: {
        characters: characterRows.length,
        characterVersions: versionRows.length,
        conversations: conversationRows.length,
        branches: branchRows.length,
        messages: messageRows.length,
        personas: personaRows.length,
        lorebooks: lorebookRows.length,
        loreEntries: loreEntryRows.length,
        presets: presetRows.length,
        regexRules: regexRows.length,
        memoryItems: memoryRows.length,
      },
      notes: [
        "This export contains story content and settings, not passwords, sessions, API keys or payment credentials.",
        "Wallet and order history are a separate personal statement and are not imported here.",
      ],
    },
    user: {
      id: user.id,
      email: user.emailNormalized,
      displayName: user.displayName ?? "用户",
      createdAt: toIso(user.createdAt),
    },
    characters: characterRows.map((character) => ({
      id: character.id,
      activeVersionId: character.activeVersionId,
      createdAt: toIso(character.createdAt),
      updatedAt: toIso(character.updatedAt),
      versions: versionRows
        .filter((version) => version.characterId === character.id)
        .sort((left, right) => left.revision - right.revision)
        .map((version) => ({
          id: version.id,
          revision: version.revision,
          sourceFormat: version.sourceFormat,
          payload: version.payloadJsonb as CharacterPayloadDto,
          createdAt: toIso(version.createdAt),
        })),
    })),
    conversations: conversationRows.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      mode: conversation.mode,
      activeBranchId: conversation.activeBranchId,
      createdAt: toIso(conversation.createdAt),
      updatedAt: toIso(conversation.updatedAt),
      branches: branchRows
        .filter((branch) => branch.conversationId === conversation.id)
        .map((branch) => ({
          id: branch.id,
          headMessageId: branch.headMessageId,
          revision: branch.revision,
          label: branch.label,
          createdAt: toIso(branch.createdAt),
        })),
      messages: messageRows
        .filter((message) => message.conversationId === conversation.id)
        .map((message) => ({
          id: message.id,
          parentId: message.parentId,
          responseGroupId: message.responseGroupId,
          role: message.role as MessageRole,
          actorRef: message.actorRef as unknown as ActorRef,
          content: message.content,
          originRunId: message.originRunId,
          tombstoneAt: toIsoOrNull(message.tombstoneAt),
          createdAt: toIso(message.createdAt),
        })),
    })),
    personas: personaRows.map((persona) => ({
      ...persona,
      versions: personaVersionRows.filter((version) => version.personaId === persona.id),
    })),
    lorebooks: lorebookRows.map((book) => ({
      ...book,
      entries: loreEntryRows.filter((entry) => entry.lorebookId === book.id),
    })),
    presets: presetRows,
    regexRules: regexRows,
    memoryItems: memoryRows,
  };
}

export interface ImportCounts {
  readonly characters: number;
  readonly conversations: number;
  readonly messages: number;
  readonly skipped: number;
}

export type ImportBundle = Pick<
  ExportBundle,
  | "characters"
  | "conversations"
  | "personas"
  | "lorebooks"
  | "presets"
  | "regexRules"
  | "memoryItems"
>;

export async function importUserData(
  db: Database,
  userId: string,
  bundle: ImportBundle,
  now: string,
): Promise<ImportCounts> {
  const skipped =
    bundle.personas.length +
    bundle.lorebooks.length +
    bundle.presets.length +
    bundle.regexRules.length +
    bundle.memoryItems.length;

  return db.transaction(async (tx) => {
    let importedCharacters = 0;
    let importedConversations = 0;
    let importedMessages = 0;

    for (const character of bundle.characters) {
      const characterId = randomUUID();
      const versionIdMap = new Map<string, string>();
      const firstVersion = character.versions[0];
      if (!firstVersion) {
        continue;
      }
      const activeVersionId = randomUUID();
      versionIdMap.set(firstVersion.id, activeVersionId);

      await tx.insert(characters).values({
        id: characterId,
        ownerUserId: userId,
        activeVersionId,
        createdAt: now,
        updatedAt: now,
      });

      for (const version of character.versions) {
        const newVersionId =
          versionIdMap.get(version.id) ??
          (() => {
            const id = randomUUID();
            versionIdMap.set(version.id, id);
            return id;
          })();
        await tx.insert(characterVersions).values({
          id: newVersionId,
          characterId,
          ownerUserId: userId,
          revision: version.revision,
          sourceFormat: version.sourceFormat,
          payloadJsonb: version.payload,
          createdAt: version.createdAt,
        });
      }

      const active =
        (character.activeVersionId && versionIdMap.get(character.activeVersionId)) ||
        activeVersionId;
      await tx
        .update(characters)
        .set({ activeVersionId: active })
        .where(eq(characters.id, characterId));

      await enqueueSyncChange(tx, {
        ownerUserId: userId,
        entityType: "character",
        entityId: characterId,
        revision: Math.max(...character.versions.map((version) => version.revision)),
        op: "upsert",
      });
      importedCharacters += 1;
    }

    for (const conversation of bundle.conversations) {
      const conversationId = randomUUID();
      const branchIdMap = new Map<string, string>();
      const messageIdMap = new Map<string, string>();
      const groupIdMap = new Map<string, string>();

      for (const message of conversation.messages) {
        messageIdMap.set(message.id, randomUUID());
      }

      await tx.insert(conversations).values({
        id: conversationId,
        ownerUserId: userId,
        title: conversation.title,
        mode: conversation.mode === "group" ? "group" : "solo",
        activeBranchId: null,
        createdAt: now,
        updatedAt: now,
      });

      for (const message of conversation.messages) {
        const newId = messageIdMap.get(message.id);
        if (!newId) {
          continue;
        }
        const newGroupId =
          groupIdMap.get(message.responseGroupId) ??
          (() => {
            const id = randomUUID();
            groupIdMap.set(message.responseGroupId, id);
            return id;
          })();
        await tx.insert(messageNodes).values({
          id: newId,
          ownerUserId: userId,
          conversationId,
          parentId: message.parentId ? (messageIdMap.get(message.parentId) ?? null) : null,
          responseGroupId: newGroupId,
          role: message.role,
          actorRef: message.actorRef as unknown as Record<string, unknown>,
          content: message.content,
          originRunId: null,
          tombstoneAt: message.tombstoneAt,
          createdAt: message.createdAt,
        });
        importedMessages += 1;
      }

      for (const branch of conversation.branches) {
        const newBranchId = randomUUID();
        branchIdMap.set(branch.id, newBranchId);
        await tx.insert(branches).values({
          id: newBranchId,
          conversationId,
          headMessageId: branch.headMessageId
            ? (messageIdMap.get(branch.headMessageId) ?? null)
            : null,
          revision: branch.revision,
          label: branch.label,
          createdAt: branch.createdAt,
        });
        await enqueueSyncChange(tx, {
          ownerUserId: userId,
          entityType: "branch",
          entityId: newBranchId,
          revision: branch.revision,
          op: "upsert",
        });
      }

      const activeBranchId = conversation.activeBranchId
        ? (branchIdMap.get(conversation.activeBranchId) ?? null)
        : null;
      await tx
        .update(conversations)
        .set({ activeBranchId })
        .where(eq(conversations.id, conversationId));

      await enqueueSyncChange(tx, {
        ownerUserId: userId,
        entityType: "conversation",
        entityId: conversationId,
        revision: 1,
        op: "upsert",
      });
      for (const newMessageId of messageIdMap.values()) {
        await enqueueSyncChange(tx, {
          ownerUserId: userId,
          entityType: "message",
          entityId: newMessageId,
          revision: 1,
          op: "upsert",
        });
      }
      importedConversations += 1;
    }

    return {
      characters: importedCharacters,
      conversations: importedConversations,
      messages: importedMessages,
      skipped,
    };
  });
}
