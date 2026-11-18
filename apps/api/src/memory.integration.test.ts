import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase, type DatabaseHandle } from "./db/client.js";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
const PASSWORD = "correct horse battery staple";

interface TestSession {
  readonly cookie: string;
}

async function register(app: FastifyInstance): Promise<TestSession> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: `memory-${randomUUID()}@example.com`,
      password: PASSWORD,
      displayName: "记忆测试",
      ageConfirmed: true,
    },
  });
  expect(response.statusCode, response.body).toBe(201);
  const setCookie = response.headers["set-cookie"];
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return { cookie: (first as string).split(";")[0] as string };
}

async function createPreviewFixture(app: FastifyInstance, cookie: string) {
  const character = await app.inject({
    method: "POST",
    url: "/api/characters",
    headers: { cookie },
    payload: { payload: { name: "记忆角色", description: "守夜人" } },
  });
  expect(character.statusCode, character.body).toBe(201);
  const characterId = (character.json() as { character: { id: string } }).character.id;

  const conversation = await app.inject({
    method: "POST",
    url: "/api/conversations",
    headers: { cookie },
    payload: { title: "记忆会话" },
  });
  expect(conversation.statusCode, conversation.body).toBe(201);
  const created = conversation.json() as { id: string; activeBranchId: string };
  return { characterId, conversationId: created.id, branchId: created.activeBranchId };
}

describeWithDatabase("M2 long-term memory", () => {
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
      MOCK_PAYMENT_SECRET: "memory-test-secret",
    });
    app = await buildApp({ config, logger: false, database });
  });

  afterAll(async () => {
    await app.close();
    await database.pool.end();
  });

  it("creates, versions, scopes and deletes memories", async () => {
    const owner = await register(app);
    const stranger = await register(app);

    const created = await app.inject({
      method: "POST",
      url: "/api/memories",
      headers: { cookie: owner.cookie },
      payload: { kind: "manual_fact", content: "主角怕水。", locked: true },
    });
    expect(created.statusCode, created.body).toBe(201);
    const memory = created.json() as { id: string; revision: number; locked: boolean };
    expect(memory.revision).toBe(1);
    expect(memory.locked).toBe(true);

    const list = await app.inject({
      method: "GET",
      url: "/api/memories",
      headers: { cookie: owner.cookie },
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { memories: unknown[] }).memories).toHaveLength(1);

    const hidden = await app.inject({
      method: "GET",
      url: `/api/memories/${memory.id}`,
      headers: { cookie: stranger.cookie },
    });
    expect(hidden.statusCode).toBe(404);

    const update = await app.inject({
      method: "PATCH",
      url: `/api/memories/${memory.id}`,
      headers: { cookie: owner.cookie },
      payload: {
        kind: "manual_fact",
        content: "主角怕水，但会游泳。",
        scope: "global",
        locked: true,
        expectedRevision: 1,
      },
    });
    expect(update.statusCode, update.body).toBe(200);
    expect((update.json() as { revision: number }).revision).toBe(2);

    const stale = await app.inject({
      method: "PATCH",
      url: `/api/memories/${memory.id}`,
      headers: { cookie: owner.cookie },
      payload: {
        kind: "manual_fact",
        content: "旧设备",
        scope: "global",
        locked: false,
        expectedRevision: 1,
      },
    });
    expect(stale.statusCode).toBe(409);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/memories/${memory.id}`,
      headers: { cookie: owner.cookie },
    });
    expect(deleted.statusCode).toBe(204);
  });

  it("rejects binding a memory to another user's conversation", async () => {
    const owner = await register(app);
    const stranger = await register(app);
    const fixture = await createPreviewFixture(app, stranger.cookie);

    const response = await app.inject({
      method: "POST",
      url: "/api/memories",
      headers: { cookie: owner.cookie },
      payload: {
        kind: "event",
        content: "别人的会话",
        conversationId: fixture.conversationId,
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it("injects locked and matched memories into the prompt preview", async () => {
    const owner = await register(app);
    const fixture = await createPreviewFixture(app, owner.cookie);

    const locked = await app.inject({
      method: "POST",
      url: "/api/memories",
      headers: { cookie: owner.cookie },
      payload: { kind: "manual_fact", content: "锁定事实：主角怕水。", locked: true },
    });
    expect(locked.statusCode, locked.body).toBe(201);
    const lockedId = (locked.json() as { id: string }).id;

    const matched = await app.inject({
      method: "POST",
      url: "/api/memories",
      headers: { cookie: owner.cookie },
      payload: { kind: "event", content: "雨夜书店里发生过争执。" },
    });
    expect(matched.statusCode, matched.body).toBe(201);

    const unrelated = await app.inject({
      method: "POST",
      url: "/api/memories",
      headers: { cookie: owner.cookie },
      payload: { kind: "summary", content: "完全无关的段落。" },
    });
    expect(unrelated.statusCode, unrelated.body).toBe(201);
    const unrelatedId = (unrelated.json() as { id: string }).id;

    const preview = await app.inject({
      method: "POST",
      url: "/api/prompt/preview",
      headers: { cookie: owner.cookie },
      payload: {
        conversationId: fixture.conversationId,
        branchId: fixture.branchId,
        characterId: fixture.characterId,
        userInput: "雨夜的书店还开着吗？",
        autoMemory: true,
        maxOutputTokens: 200,
        contextWindowTokens: 4096,
        seed: 9,
      },
    });
    expect(preview.statusCode, preview.body).toBe(200);
    const body = preview.json();
    const selectedIds = body.memory.selected.map((item: { id: string }) => item.id);
    expect(selectedIds).toContain(lockedId);
    expect(body.memory.selected[0].reason).toBe("locked");
    expect(body.memory.selected.some((item: { reason: string }) => item.reason === "keyword")).toBe(
      true,
    );
    expect(selectedIds).not.toContain(unrelatedId);
    expect(body.plan.systemPrompt).toContain("锁定事实：主角怕水。");
    expect(body.plan.systemPrompt).toContain("雨夜书店里发生过争执。");
    expect(
      body.plan.components.some(
        (component: { kind: string; included: boolean }) =>
          component.kind === "memory" && component.included,
      ),
    ).toBe(true);

    const replay = await app.inject({
      method: "POST",
      url: "/api/prompt/preview",
      headers: { cookie: owner.cookie },
      payload: {
        conversationId: fixture.conversationId,
        branchId: fixture.branchId,
        characterId: fixture.characterId,
        userInput: "雨夜的书店还开着吗？",
        autoMemory: true,
        maxOutputTokens: 200,
        contextWindowTokens: 4096,
        seed: 9,
      },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().plan.digest).toBe(body.plan.digest);
  });

  it("excludes memories bound to another conversation and reports explicit misses", async () => {
    const owner = await register(app);
    const fixture = await createPreviewFixture(app, owner.cookie);
    const otherConversation = await app.inject({
      method: "POST",
      url: "/api/conversations",
      headers: { cookie: owner.cookie },
      payload: { title: "另一个会话" },
    });
    const otherId = (otherConversation.json() as { id: string }).id;

    const bound = await app.inject({
      method: "POST",
      url: "/api/memories",
      headers: { cookie: owner.cookie },
      payload: {
        kind: "event",
        content: "雨夜里的另一条线。",
        conversationId: otherId,
      },
    });
    expect(bound.statusCode, bound.body).toBe(201);
    const boundId = (bound.json() as { id: string }).id;

    const preview = await app.inject({
      method: "POST",
      url: "/api/prompt/preview",
      headers: { cookie: owner.cookie },
      payload: {
        conversationId: fixture.conversationId,
        branchId: fixture.branchId,
        characterId: fixture.characterId,
        userInput: "雨夜",
        autoMemory: true,
        memoryIds: [randomUUID()],
        maxOutputTokens: 200,
        contextWindowTokens: 4096,
        seed: 2,
      },
    });
    expect(preview.statusCode, preview.body).toBe(200);
    const body = preview.json();
    expect(body.memory.selected.map((item: { id: string }) => item.id)).not.toContain(boundId);
    expect(body.memory.skipped).toContainEqual({
      id: boundId,
      reason: "other-conversation",
    });
    expect(
      body.memory.skipped.some((item: { reason: string }) => item.reason === "not-found"),
    ).toBe(true);
  });
});
