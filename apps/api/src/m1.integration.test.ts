import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseCharacterCard, serializeCharacterCardPng } from "@xuyueji/compat";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase, type DatabaseHandle } from "./db/client.js";
import {
  authSessions,
  branches,
  characters,
  conversations,
  messageNodes,
  presets,
  users,
} from "./db/schema.js";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
const PASSWORD = "correct horse battery staple";

interface TestSession {
  readonly cookie: string;
  readonly userId: string;
  readonly email: string;
}

async function register(
  app: FastifyInstance,
  email: string,
  displayName = "测试用户",
): Promise<TestSession> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email,
      password: PASSWORD,
      displayName,
      ageConfirmed: true,
    },
  });
  expect(response.statusCode, response.body).toBe(201);
  const setCookie = response.headers["set-cookie"];
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  expect(first).toBeTruthy();
  const cookie = (first as string).split(";")[0] as string;
  const body = response.json() as { user: { id: string } };
  return { cookie, userId: body.user.id, email };
}

describeWithDatabase("M1 auth, cloud storage, message graph and sync", () => {
  let app: FastifyInstance;
  let database: DatabaseHandle;

  beforeAll(async () => {
    database = createDatabase(databaseUrl as string);
    await migrate(database.db, { migrationsFolder });
    await database.pool.query("TRUNCATE users CASCADE");

    const config = loadConfig({
      DEMO_MODE: "true",
      DATABASE_URL: databaseUrl,
      PUBLIC_SIGNUP_ENABLED: "true",
      RATE_LIMIT_MAX: "10000",
      AUTH_SIGNUP_RATE_LIMIT_MAX: "10000",
      AUTH_LOGIN_RATE_LIMIT_MAX: "10000",
      SESSION_TTL_DAYS: "7",
      MOCK_PAYMENT_SECRET: "m1-test-secret",
    });
    app = await buildApp({ config, logger: false, database });
  });

  afterAll(async () => {
    await app.close();
    await database.pool.end();
  });

  it("registers, authenticates and revokes a session", async () => {
    const email = `auth-${randomUUID()}@example.com`;
    const session = await register(app, email);

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: session.cookie },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe(email);

    const wrong = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "wrong password value" },
    });
    expect(wrong.statusCode).toBe(401);

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email,
        password: PASSWORD,
        displayName: "重复",
        ageConfirmed: true,
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe("EMAIL_TAKEN");

    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie: session.cookie },
    });
    expect(logout.statusCode).toBe(204);

    const afterLogout = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: session.cookie },
    });
    expect(afterLogout.statusCode).toBe(401);

    const [sessionRow] = await database.db
      .select()
      .from(authSessions)
      .where(eq(authSessions.userId, session.userId))
      .limit(1);
    expect(sessionRow?.revokedAt).not.toBeNull();
  });

  it("isolates characters by owner and enforces version CAS", async () => {
    const owner = await register(app, `owner-${randomUUID()}@example.com`);
    const stranger = await register(app, `stranger-${randomUUID()}@example.com`);

    const created = await app.inject({
      method: "POST",
      url: "/api/characters",
      headers: { cookie: owner.cookie },
      payload: {
        payload: { name: "测试角色", description: "第一版" },
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const character = created.json() as {
      character: { id: string; activeVersionId: string; revision: number };
    };
    expect(character.character.revision).toBe(1);

    const hidden = await app.inject({
      method: "GET",
      url: `/api/characters/${character.character.id}`,
      headers: { cookie: stranger.cookie },
    });
    expect(hidden.statusCode).toBe(404);

    const stale = await app.inject({
      method: "POST",
      url: `/api/characters/${character.character.id}/versions`,
      headers: { cookie: owner.cookie },
      payload: {
        expectedActiveVersionId: "not-the-current-version",
        payload: { name: "测试角色", description: "旧设备" },
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("VERSION_CONFLICT");

    const accepted = await app.inject({
      method: "POST",
      url: `/api/characters/${character.character.id}/versions`,
      headers: { cookie: owner.cookie },
      payload: {
        expectedActiveVersionId: character.character.activeVersionId,
        payload: { name: "测试角色", description: "第二版" },
      },
    });
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(accepted.json().revision).toBe(2);
    expect(accepted.json().versionCount).toBe(2);

    const [row] = await database.db
      .select()
      .from(characters)
      .where(eq(characters.id, character.character.id))
      .limit(1);
    expect(row?.ownerUserId).toBe(owner.userId);
    expect(row?.activeVersionId).toBe(accepted.json().activeVersionId);
  });

  it("imports and exports V2/V3 character cards with unknown fields", async () => {
    const session = await register(app, `cards-${randomUUID()}@example.com`);
    const card = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "角色卡导入测试",
        description: "来自 V2 JSON",
        first_mes: "第一句开场白",
        alternate_greetings: ["第二句"],
        tags: ["测试"],
        creator: "fixture",
        character_version: "1.0",
        x_unknown_data: { keep: 1 },
        character_book: { entries: [] },
      },
      x_unknown_top: "keep-me",
    };

    const imported = await app.inject({
      method: "POST",
      url: "/api/characters/import",
      headers: { cookie: session.cookie },
      payload: { kind: "json", card },
    });
    expect(imported.statusCode, imported.body).toBe(201);
    const importedBody = imported.json() as {
      character: { character: { id: string; name: string } };
      report: {
        format: string;
        unknownDataFields: number;
        unknownTopLevelFields: number;
      };
    };
    expect(importedBody.report.format).toBe("v2");
    expect(importedBody.report.unknownDataFields).toBeGreaterThanOrEqual(3);
    expect(importedBody.report.unknownTopLevelFields).toBe(1);
    expect(importedBody.character.character.name).toBe("角色卡导入测试");

    const characterId = importedBody.character.character.id;
    const exportedV2 = await app.inject({
      method: "GET",
      url: `/api/characters/${characterId}/export?format=v2`,
      headers: { cookie: session.cookie },
    });
    expect(exportedV2.statusCode, exportedV2.body).toBe(200);
    const v2 = exportedV2.json() as {
      spec: string;
      x_unknown_top: string;
      data: Record<string, unknown>;
    };
    expect(v2.spec).toBe("chara_card_v2");
    expect(v2.x_unknown_top).toBe("keep-me");
    expect(v2.data.x_unknown_data).toEqual({ keep: 1 });
    expect(v2.data.creator).toBe("fixture");
    expect(v2.data.character_book).toEqual({ entries: [] });

    const exportedV3 = await app.inject({
      method: "GET",
      url: `/api/characters/${characterId}/export?format=v3`,
      headers: { cookie: session.cookie },
    });
    expect(exportedV3.statusCode, exportedV3.body).toBe(200);
    expect(exportedV3.json().spec).toBe("chara_card_v3");

    const onePixelPng = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const pngCard = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: { name: "PNG 导入测试", description: "PNG 内嵌角色卡" },
    };
    const parsed = parseCharacterCard(pngCard);
    const png = serializeCharacterCardPng(onePixelPng, parsed.payload, "v2");
    const pngImport = await app.inject({
      method: "POST",
      url: "/api/characters/import",
      headers: { cookie: session.cookie },
      payload: { kind: "png-base64", base64: Buffer.from(png).toString("base64") },
    });
    expect(pngImport.statusCode, pngImport.body).toBe(201);
    expect(pngImport.json().character.character.name).toBe("PNG 导入测试");

    const invalid = await app.inject({
      method: "POST",
      url: "/api/characters/import",
      headers: { cookie: session.cookie },
      payload: { kind: "json", card: { spec: "unknown" } },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe("INVALID_CHARACTER_CARD");
  });

  it("stores a message graph with swipe candidates, CAS conflicts and tombstones", async () => {
    const session = await register(app, `graph-${randomUUID()}@example.com`);

    const created = await app.inject({
      method: "POST",
      url: "/api/conversations",
      headers: { cookie: session.cookie },
      payload: { title: "月光分支测试" },
    });
    expect(created.statusCode, created.body).toBe(201);
    const conversation = created.json() as {
      id: string;
      activeBranchId: string;
      branchRevision: number;
    };

    const userMessage = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversation.id}/messages`,
      headers: { cookie: session.cookie },
      payload: {
        branchId: conversation.activeBranchId,
        expectedBranchRevision: 0,
        parentId: null,
        role: "user",
        content: "今晚书店还开着吗？",
        requestId: "graph-req-1",
      },
    });
    expect(userMessage.statusCode, userMessage.body).toBe(201);
    const userMessageId = userMessage.json().message.id as string;
    expect(userMessage.json().branch.revision).toBe(1);

    const retried = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversation.id}/messages`,
      headers: { cookie: session.cookie },
      payload: {
        branchId: conversation.activeBranchId,
        expectedBranchRevision: 0,
        parentId: null,
        role: "user",
        content: "今晚书店还开着吗？",
        requestId: "graph-req-1",
      },
    });
    expect(retried.statusCode, retried.body).toBe(201);
    expect(retried.json().message.id).toBe(userMessageId);

    const actorRef = {
      kind: "character",
      id: "character_demo",
      versionId: "character_version_demo_1",
    };
    const candidateOne = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversation.id}/candidates`,
      headers: { cookie: session.cookie },
      payload: {
        branchId: conversation.activeBranchId,
        expectedBranchRevision: 1,
        parentMessageId: userMessageId,
        actorRef,
        content: "第一版回复。",
        requestId: "graph-req-2",
      },
    });
    expect(candidateOne.statusCode, candidateOne.body).toBe(201);
    const candidateOneId = candidateOne.json().message.id as string;
    const responseGroupId = candidateOne.json().message.responseGroupId as string;

    const candidateTwo = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversation.id}/candidates`,
      headers: { cookie: session.cookie },
      payload: {
        branchId: conversation.activeBranchId,
        expectedBranchRevision: 2,
        parentMessageId: userMessageId,
        responseGroupId,
        actorRef,
        content: "第二版回复。",
        requestId: "graph-req-3",
      },
    });
    expect(candidateTwo.statusCode, candidateTwo.body).toBe(201);
    const candidateTwoId = candidateTwo.json().message.id as string;
    expect(candidateTwo.json().branch.revision).toBe(3);

    const rows = await database.db
      .select()
      .from(messageNodes)
      .where(eq(messageNodes.conversationId, conversation.id));
    expect(rows).toHaveLength(3);
    const one = rows.find((row) => row.id === candidateOneId);
    const two = rows.find((row) => row.id === candidateTwoId);
    expect(one?.content).toBe("第一版回复。");
    expect(two?.content).toBe("第二版回复。");
    expect(one?.parentId).toBe(userMessageId);
    expect(two?.parentId).toBe(userMessageId);
    expect(one?.responseGroupId).toBe(two?.responseGroupId);

    const [branchBeforeSelect] = await database.db
      .select()
      .from(branches)
      .where(eq(branches.id, conversation.activeBranchId))
      .limit(1);
    expect(branchBeforeSelect?.headMessageId).toBe(candidateTwoId);

    const selected = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversation.id}/candidates/select`,
      headers: { cookie: session.cookie },
      payload: {
        branchId: conversation.activeBranchId,
        expectedBranchRevision: 3,
        messageId: candidateOneId,
      },
    });
    expect(selected.statusCode, selected.body).toBe(200);
    expect(selected.json().branch.headMessageId).toBe(candidateOneId);
    expect(selected.json().branch.revision).toBe(4);

    const pageOne = await app.inject({
      method: "GET",
      url: `/api/conversations/${conversation.id}/messages?branchId=${conversation.activeBranchId}&limit=50`,
      headers: { cookie: session.cookie },
    });
    expect(pageOne.statusCode, pageOne.body).toBe(200);
    expect(pageOne.json().messages.map((m: { id: string }) => m.id)).toEqual([
      userMessageId,
      candidateOneId,
    ]);

    const secondDevice = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversation.id}/messages`,
      headers: { cookie: session.cookie },
      payload: {
        branchId: conversation.activeBranchId,
        expectedBranchRevision: 4,
        parentId: candidateOneId,
        role: "user",
        content: "第二台设备写入。",
        requestId: "graph-req-4",
      },
    });
    expect(secondDevice.statusCode, secondDevice.body).toBe(201);

    const staleWrite = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversation.id}/messages`,
      headers: { cookie: session.cookie },
      payload: {
        branchId: conversation.activeBranchId,
        expectedBranchRevision: 4,
        parentId: candidateOneId,
        role: "user",
        content: "过期写入。",
        requestId: "graph-req-stale",
      },
    });
    expect(staleWrite.statusCode).toBe(409);
    expect(staleWrite.json().error.code).toBe("VERSION_CONFLICT");

    const edited = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversation.id}/messages/${userMessageId}/edit`,
      headers: { cookie: session.cookie },
      payload: {
        branchId: conversation.activeBranchId,
        expectedBranchRevision: 5,
        content: "今晚书店还开着吗？（改）",
      },
    });
    expect(edited.statusCode, edited.body).toBe(201);
    expect(edited.json().message.content).toBe("今晚书店还开着吗？（改）");
    expect(edited.json().message.id).not.toBe(userMessageId);

    const [original] = await database.db
      .select()
      .from(messageNodes)
      .where(eq(messageNodes.id, userMessageId))
      .limit(1);
    expect(original?.content).toBe("今晚书店还开着吗？");

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/conversations/${conversation.id}/messages/${candidateOneId}`,
      headers: { cookie: session.cookie },
    });
    expect(deleted.statusCode).toBe(204);

    const [tombstoned] = await database.db
      .select()
      .from(messageNodes)
      .where(eq(messageNodes.id, candidateOneId))
      .limit(1);
    expect(tombstoned?.tombstoneAt).not.toBeNull();

    const sync = await app.inject({
      method: "GET",
      url: "/api/sync",
      headers: { cookie: session.cookie },
    });
    expect(sync.statusCode, sync.body).toBe(200);
    const syncBody = sync.json() as {
      changes: Array<{ entityType: string; op: string }>;
      nextCursor: string;
    };
    expect(syncBody.changes.length).toBeGreaterThan(0);
    expect(syncBody.changes.some((change) => change.entityType === "message")).toBe(true);

    const caughtUp = await app.inject({
      method: "GET",
      url: `/api/sync?cursor=${encodeURIComponent(syncBody.nextCursor)}`,
      headers: { cookie: session.cookie },
    });
    expect(caughtUp.statusCode).toBe(200);
    expect(caughtUp.json().changes).toHaveLength(0);

    const invalidCursor = await app.inject({
      method: "GET",
      url: "/api/sync?cursor=not-a-cursor",
      headers: { cookie: session.cookie },
    });
    expect(invalidCursor.statusCode).toBe(400);

    const [conversationRow] = await database.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversation.id))
      .limit(1);
    expect(conversationRow?.activeBranchId).toBe(edited.json().branch.id);

    const [userRow] = await database.db
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    expect(userRow?.passwordHash).not.toBeNull();
    expect(JSON.stringify(userRow)).not.toContain(PASSWORD);
  });

  it("applies idempotent sync mutations with CAS and tombstones", async () => {
    const session = await register(app, `mutations-${randomUUID()}@example.com`);
    const presetId = randomUUID();

    const create = await app.inject({
      method: "POST",
      url: "/api/mutations",
      headers: { cookie: session.cookie },
      payload: {
        mutations: [
          {
            opId: "mop-create-1",
            entityType: "preset",
            entityId: presetId,
            expectedRevision: null,
            action: "upsert",
            payload: { title: "Preset A", payload: { temperature: 0.8 } },
          },
        ],
      },
    });
    expect(create.statusCode, create.body).toBe(200);
    expect(create.json().results[0]).toMatchObject({
      status: "accepted",
      newRevision: 1,
    });

    const replay = await app.inject({
      method: "POST",
      url: "/api/mutations",
      headers: { cookie: session.cookie },
      payload: {
        mutations: [
          {
            opId: "mop-create-1",
            entityType: "preset",
            entityId: presetId,
            expectedRevision: null,
            action: "upsert",
            payload: { title: "Replay must not overwrite", payload: { temperature: 0.1 } },
          },
        ],
      },
    });
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json().results[0].newRevision).toBe(1);

    const update = await app.inject({
      method: "POST",
      url: "/api/mutations",
      headers: { cookie: session.cookie },
      payload: {
        mutations: [
          {
            opId: "mop-update-1",
            entityType: "preset",
            entityId: presetId,
            expectedRevision: 1,
            action: "upsert",
            payload: { title: "Preset B", payload: { temperature: 0.7 } },
          },
        ],
      },
    });
    expect(update.statusCode, update.body).toBe(200);
    expect(update.json().results[0].newRevision).toBe(2);

    const stale = await app.inject({
      method: "POST",
      url: "/api/mutations",
      headers: { cookie: session.cookie },
      payload: {
        mutations: [
          {
            opId: "mop-update-stale",
            entityType: "preset",
            entityId: presetId,
            expectedRevision: 1,
            action: "upsert",
            payload: { title: "Stale", payload: {} },
          },
        ],
      },
    });
    expect(stale.statusCode).toBe(200);
    expect(stale.json().results[0].status).toBe("conflict");

    const remove = await app.inject({
      method: "POST",
      url: "/api/mutations",
      headers: { cookie: session.cookie },
      payload: {
        mutations: [
          {
            opId: "mop-delete-1",
            entityType: "preset",
            entityId: presetId,
            expectedRevision: 2,
            action: "delete",
            payload: null,
          },
        ],
      },
    });
    expect(remove.statusCode, remove.body).toBe(200);
    expect(remove.json().results[0].status).toBe("accepted");

    const [stored] = await database.db
      .select()
      .from(presets)
      .where(eq(presets.id, presetId))
      .limit(1);
    expect(stored?.title).toBe("Preset B");
    expect(stored?.revision).toBe(2);
    expect(stored?.deletedAt).not.toBeNull();

    const lorebookId = randomUUID();
    const lorebook = await app.inject({
      method: "POST",
      url: "/api/mutations",
      headers: { cookie: session.cookie },
      payload: {
        mutations: [
          {
            opId: "mop-lorebook-1",
            entityType: "lorebook",
            entityId: lorebookId,
            expectedRevision: null,
            action: "upsert",
            payload: { title: "雨夜书店" },
          },
        ],
      },
    });
    expect(lorebook.statusCode, lorebook.body).toBe(200);
    expect(lorebook.json().results[0].newRevision).toBe(1);

    const sync = await app.inject({
      method: "GET",
      url: "/api/sync",
      headers: { cookie: session.cookie },
    });
    const entityTypes = (sync.json().changes as Array<{ entityType: string }>).map(
      (change) => change.entityType,
    );
    expect(entityTypes).toContain("preset");
    expect(entityTypes).toContain("lorebook");
  });

  it("exports and restores characters and conversations under a new account", async () => {
    const source = await register(app, `export-${randomUUID()}@example.com`);

    const characterResponse = await app.inject({
      method: "POST",
      url: "/api/characters",
      headers: { cookie: source.cookie },
      payload: {
        payload: { name: "可导出的角色", description: "导出恢复测试" },
      },
    });
    expect(characterResponse.statusCode, characterResponse.body).toBe(201);

    const conversationResponse = await app.inject({
      method: "POST",
      url: "/api/conversations",
      headers: { cookie: source.cookie },
      payload: { title: "可导出的会话" },
    });
    expect(conversationResponse.statusCode, conversationResponse.body).toBe(201);
    const conversation = conversationResponse.json() as {
      id: string;
      activeBranchId: string;
    };

    const userMessage = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversation.id}/messages`,
      headers: { cookie: source.cookie },
      payload: {
        branchId: conversation.activeBranchId,
        expectedBranchRevision: 0,
        parentId: null,
        role: "user",
        content: "导出前的用户消息",
        requestId: "export-req-1",
      },
    });
    expect(userMessage.statusCode, userMessage.body).toBe(201);
    const userMessageId = userMessage.json().message.id as string;

    const candidate = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversation.id}/candidates`,
      headers: { cookie: source.cookie },
      payload: {
        branchId: conversation.activeBranchId,
        expectedBranchRevision: 1,
        parentMessageId: userMessageId,
        actorRef: { kind: "character", id: "character_demo", versionId: "v1" },
        content: "导出前的角色回复",
        requestId: "export-req-2",
      },
    });
    expect(candidate.statusCode, candidate.body).toBe(201);

    const exported = await app.inject({
      method: "GET",
      url: "/api/export",
      headers: { cookie: source.cookie },
    });
    expect(exported.statusCode, exported.body).toBe(200);
    expect(exported.headers["content-disposition"]).toContain("attachment");
    const bundle = exported.json() as {
      manifest: { counts: Record<string, number> };
      characters: unknown[];
    };
    expect(bundle.manifest.counts.characters).toBe(1);
    expect(bundle.manifest.counts.conversations).toBe(1);
    expect(bundle.manifest.counts.messages).toBe(2);

    const target = await register(app, `restore-${randomUUID()}@example.com`);
    const imported = await app.inject({
      method: "POST",
      url: "/api/import",
      headers: { cookie: target.cookie },
      payload: bundle,
    });
    expect(imported.statusCode, imported.body).toBe(200);
    expect(imported.json().imported.characters).toBe(1);
    expect(imported.json().imported.conversations).toBe(1);
    expect(imported.json().imported.messages).toBe(2);

    const targetCharacters = await app.inject({
      method: "GET",
      url: "/api/characters",
      headers: { cookie: target.cookie },
    });
    expect(targetCharacters.statusCode).toBe(200);
    expect(targetCharacters.json().characters).toHaveLength(1);
    expect(targetCharacters.json().characters[0].name).toBe("可导出的角色");

    const targetConversations = await app.inject({
      method: "GET",
      url: "/api/conversations",
      headers: { cookie: target.cookie },
    });
    expect(targetConversations.statusCode).toBe(200);
    expect(targetConversations.json().conversations).toHaveLength(1);
    const restoredConversation = targetConversations.json().conversations[0] as {
      id: string;
      activeBranchId: string;
      title: string;
    };
    expect(restoredConversation.title).toBe("可导出的会话");

    const restoredMessages = await app.inject({
      method: "GET",
      url: `/api/conversations/${restoredConversation.id}/messages?branchId=${restoredConversation.activeBranchId}`,
      headers: { cookie: target.cookie },
    });
    expect(restoredMessages.statusCode, restoredMessages.body).toBe(200);
    expect(
      restoredMessages.json().messages.map((message: { content: string }) => message.content),
    ).toEqual(["导出前的用户消息", "导出前的角色回复"]);
    expect(restoredMessages.json().messages[0].id).not.toBe(userMessageId);
  });

  it("paginates a 2,500-message branch without returning the whole graph", async () => {
    const session = await register(app, `page-${randomUUID()}@example.com`);
    const created = await app.inject({
      method: "POST",
      url: "/api/conversations",
      headers: { cookie: session.cookie },
      payload: { title: "长分支" },
    });
    expect(created.statusCode, created.body).toBe(201);
    const conversation = created.json() as { id: string; activeBranchId: string };

    const total = 2_500;
    const ids: string[] = [];
    const rows: Array<typeof messageNodes.$inferInsert> = [];
    let parentId: string | null = null;
    const base = Date.parse("2026-11-18T00:00:00.000Z");

    for (let index = 0; index < total; index += 1) {
      const id = randomUUID();
      ids.push(id);
      rows.push({
        id,
        ownerUserId: session.userId,
        conversationId: conversation.id,
        parentId,
        responseGroupId: randomUUID(),
        role: index % 2 === 0 ? "user" : "assistant",
        actorRef:
          index % 2 === 0
            ? { kind: "user", id: session.userId }
            : { kind: "character", id: "character_demo", versionId: "v1" },
        content: `message ${index + 1}`,
        createdAt: new Date(base + index * 1000).toISOString(),
      });
      parentId = id;
    }

    for (let offset = 0; offset < rows.length; offset += 250) {
      await database.db.insert(messageNodes).values(rows.slice(offset, offset + 250));
    }
    await database.db
      .update(branches)
      .set({ headMessageId: ids.at(-1), revision: total })
      .where(eq(branches.id, conversation.activeBranchId));
    await database.db
      .update(conversations)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(conversations.id, conversation.id));

    let before: string | null = null;
    const seen: string[] = [];
    let pages = 0;
    let firstPageLast: string | null = null;
    let lastPageFirst: string | null = null;
    do {
      const url = [
        `/api/conversations/${conversation.id}/messages?branchId=${conversation.activeBranchId}`,
        before ? `&before=${before}` : "",
        "&limit=50",
      ].join("");
      const page = await app.inject({
        method: "GET",
        url,
        headers: { cookie: session.cookie },
      });
      expect(page.statusCode, page.body).toBe(200);
      const body = page.json() as {
        messages: Array<{ id: string }>;
        hasMore: boolean;
        nextBefore: string | null;
      };
      expect(body.messages.length).toBeLessThanOrEqual(50);
      seen.push(...body.messages.map((message) => message.id));
      lastPageFirst = body.messages[0]?.id ?? null;
      if (pages === 0) {
        firstPageLast = body.messages.at(-1)?.id ?? null;
      }
      before = body.nextBefore;
      pages += 1;
      if (!body.hasMore) {
        break;
      }
      expect(pages).toBeLessThan(60);
    } while (pages < 60);

    expect(pages).toBe(50);
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
    // Page 1 is the newest chunk, in oldest-to-newest order; later pages are
    // older chunks. The first page must end at the newest message, and the
    // final page must begin at the oldest.
    expect(firstPageLast).toBe(ids.at(-1));
    expect(lastPageFirst).toBe(ids[0]);
  });
});
