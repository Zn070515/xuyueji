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
  readonly userId: string;
}

async function register(app: FastifyInstance): Promise<TestSession> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: `regex-${randomUUID()}@example.com`,
      password: PASSWORD,
      displayName: "正则测试",
      ageConfirmed: true,
    },
  });
  expect(response.statusCode, response.body).toBe(201);
  const setCookie = response.headers["set-cookie"];
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const cookie = (first as string).split(";")[0] as string;
  return { cookie, userId: (response.json() as { user: { id: string } }).user.id };
}

async function createPreviewFixture(app: FastifyInstance, cookie: string) {
  const characterResponse = await app.inject({
    method: "POST",
    url: "/api/characters",
    headers: { cookie },
    payload: {
      payload: {
        name: "正则角色",
        description: "雨夜书店店主",
        exampleMessages: ["用户：在吗？\n角色：在。"],
      },
    },
  });
  expect(characterResponse.statusCode, characterResponse.body).toBe(201);
  const characterId = (characterResponse.json() as { character: { id: string } }).character.id;

  const conversationResponse = await app.inject({
    method: "POST",
    url: "/api/conversations",
    headers: { cookie },
    payload: { title: "正则会话" },
  });
  expect(conversationResponse.statusCode, conversationResponse.body).toBe(201);
  const conversation = conversationResponse.json() as {
    id: string;
    activeBranchId: string;
    branchRevision: number;
  };

  const message = await app.inject({
    method: "POST",
    url: `/api/conversations/${conversation.id}/messages`,
    headers: { cookie },
    payload: {
      branchId: conversation.activeBranchId,
      expectedBranchRevision: conversation.branchRevision,
      parentId: null,
      role: "user",
      content: "上次说书店里有一本旧书。",
      requestId: randomUUID(),
    },
  });
  expect(message.statusCode, message.body).toBe(201);

  const lorebookResponse = await app.inject({
    method: "POST",
    url: "/api/lorebooks",
    headers: { cookie },
    payload: { title: "正则世界书" },
  });
  expect(lorebookResponse.statusCode, lorebookResponse.body).toBe(201);
  const lorebookId = (lorebookResponse.json() as { id: string }).id;
  const entry = await app.inject({
    method: "POST",
    url: `/api/lorebooks/${lorebookId}/entries`,
    headers: { cookie },
    payload: {
      content: "晴天书单：只有晴天才会出现的书。",
      keys: ["晴天"],
      enabled: true,
      sortKey: 1,
    },
  });
  expect(entry.statusCode, entry.body).toBe(201);

  return {
    characterId,
    conversationId: conversation.id,
    branchId: conversation.activeBranchId,
    lorebookId,
  };
}

describeWithDatabase("M2 regex rules and prompt pipeline", () => {
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
      MOCK_PAYMENT_SECRET: "regex-test-secret",
    });
    app = await buildApp({ config, logger: false, database });
  });

  afterAll(async () => {
    await app.close();
    await database.pool.end();
  });

  it("creates, versions, scopes and deletes regex rules", async () => {
    const owner = await register(app);
    const stranger = await register(app);

    const created = await app.inject({
      method: "POST",
      url: "/api/regex-rules",
      headers: { cookie: owner.cookie },
      payload: {
        title: "替换称呼",
        stage: "user_input",
        pattern: "掌柜",
        flags: "",
        replacement: "店主",
        sortOrder: 3,
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const rule = created.json() as { id: string; revision: number; replacement: string };
    expect(rule.revision).toBe(1);
    expect(rule.replacement).toBe("店主");

    const list = await app.inject({
      method: "GET",
      url: "/api/regex-rules",
      headers: { cookie: owner.cookie },
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { rules: unknown[] }).rules).toHaveLength(1);

    const hidden = await app.inject({
      method: "GET",
      url: `/api/regex-rules/${rule.id}`,
      headers: { cookie: stranger.cookie },
    });
    expect(hidden.statusCode).toBe(404);

    const update = await app.inject({
      method: "PATCH",
      url: `/api/regex-rules/${rule.id}`,
      headers: { cookie: owner.cookie },
      payload: {
        title: "替换称呼 v2",
        stage: "user_input",
        pattern: "掌柜",
        flags: "",
        replacement: "店长",
        sortOrder: 3,
        enabled: true,
        expectedRevision: 1,
      },
    });
    expect(update.statusCode, update.body).toBe(200);
    expect((update.json() as { revision: number }).revision).toBe(2);

    const stale = await app.inject({
      method: "PATCH",
      url: `/api/regex-rules/${rule.id}`,
      headers: { cookie: owner.cookie },
      payload: {
        title: "旧设备",
        stage: "user_input",
        pattern: "掌柜",
        flags: "",
        replacement: "店长",
        sortOrder: 3,
        enabled: true,
        expectedRevision: 1,
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("VERSION_CONFLICT");

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/regex-rules/${rule.id}`,
      headers: { cookie: owner.cookie },
    });
    expect(deleted.statusCode).toBe(204);

    const gone = await app.inject({
      method: "GET",
      url: `/api/regex-rules/${rule.id}`,
      headers: { cookie: owner.cookie },
    });
    expect(gone.statusCode).toBe(404);
  });

  it("rejects unsafe or unsupported patterns before storing them", async () => {
    const owner = await register(app);

    for (const pattern of ["(a+)+$", "(?=abc)", "(a)\\1", "[unterminated"]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/regex-rules",
        headers: { cookie: owner.cookie },
        payload: {
          title: "危险规则",
          stage: "user_input",
          pattern,
          flags: "",
          replacement: "",
        },
      });
      expect(response.statusCode, `${pattern}: ${response.body}`).toBe(400);
      expect(response.json().error.code).toBe("REGEX_INVALID");
    }

    const list = await app.inject({
      method: "GET",
      url: "/api/regex-rules",
      headers: { cookie: owner.cookie },
    });
    expect((list.json() as { rules: unknown[] }).rules).toHaveLength(0);
  });

  it("runs a stored rule against a sample through the test endpoint", async () => {
    const owner = await register(app);

    const tested = await app.inject({
      method: "POST",
      url: "/api/regex-rules/test",
      headers: { cookie: owner.cookie },
      payload: {
        pattern: "（([^）]+)）",
        flags: "",
        replacement: "*$1*",
        sample: "他低声说（别回头）。",
      },
    });
    expect(tested.statusCode, tested.body).toBe(200);
    const body = tested.json() as { output: string; matchCount: number; steps: number };
    expect(body.output).toBe("他低声说*别回头*。");
    expect(body.matchCount).toBe(1);
    expect(body.steps).toBeGreaterThan(0);

    const rejected = await app.inject({
      method: "POST",
      url: "/api/regex-rules/test",
      headers: { cookie: owner.cookie },
      payload: { pattern: "(a*)*", flags: "", replacement: "", sample: "aaaa" },
    });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().error.code).toBe("REGEX_INVALID");
  });

  it("applies user-input and prompt-build stages in the preview pipeline", async () => {
    const owner = await register(app);
    const fixture = await createPreviewFixture(app, owner.cookie);

    const inputRule = await app.inject({
      method: "POST",
      url: "/api/regex-rules",
      headers: { cookie: owner.cookie },
      payload: {
        title: "雨夜改晴天",
        stage: "user_input",
        pattern: "雨夜",
        flags: "",
        replacement: "晴天",
        sortOrder: 1,
      },
    });
    expect(inputRule.statusCode, inputRule.body).toBe(201);
    const inputRuleId = (inputRule.json() as { id: string }).id;

    const promptRule = await app.inject({
      method: "POST",
      url: "/api/regex-rules",
      headers: { cookie: owner.cookie },
      payload: {
        title: "书店改茶馆",
        stage: "prompt_build",
        pattern: "书店",
        flags: "",
        replacement: "茶馆",
        sortOrder: 2,
      },
    });
    expect(promptRule.statusCode, promptRule.body).toBe(201);
    const promptRuleId = (promptRule.json() as { id: string }).id;

    const deferredRule = await app.inject({
      method: "POST",
      url: "/api/regex-rules",
      headers: { cookie: owner.cookie },
      payload: {
        title: "输出美化",
        stage: "display_only",
        pattern: "\\*",
        flags: "",
        replacement: "·",
        sortOrder: 3,
      },
    });
    expect(deferredRule.statusCode, deferredRule.body).toBe(201);
    const deferredRuleId = (deferredRule.json() as { id: string }).id;

    const preview = await app.inject({
      method: "POST",
      url: "/api/prompt/preview",
      headers: { cookie: owner.cookie },
      payload: {
        conversationId: fixture.conversationId,
        branchId: fixture.branchId,
        characterId: fixture.characterId,
        userInput: "雨夜里我想去书店。",
        lorebookIds: [fixture.lorebookId],
        regexRuleIds: [inputRuleId, promptRuleId, deferredRuleId, randomUUID()],
        maxOutputTokens: 200,
        contextWindowTokens: 4096,
        seed: 5,
      },
    });
    expect(preview.statusCode, preview.body).toBe(200);
    const body = preview.json();

    expect(body.regex.transformedInput).toBe("晴天里我想去书店。");
    expect(body.plan.messages.at(-1)).toEqual({ role: "user", content: "晴天里我想去书店。" });
    // World info scans the transformed input, so the sunny-day entry activates.
    expect(body.worldInfo.activated).toHaveLength(1);
    expect(body.worldInfo.activated[0].content).toContain("晴天书单");
    // prompt_build rewrites injectable content but never the platform policy.
    const historyMessage = body.plan.messages.find((message: { content: string }) =>
      message.content.includes("茶馆"),
    );
    expect(historyMessage?.content).toContain("茶馆");
    expect(body.plan.systemPrompt).toContain("平台安全策略");
    // The character card is mandatory content and is never rewritten.
    expect(body.plan.systemPrompt).toContain("雨夜书店店主");
    expect(body.plan.systemPrompt).not.toContain("茶馆");
    // Display-only rules are reported, not executed.
    expect(body.regex.applied.map((item: { ruleId: string }) => item.ruleId).sort()).toEqual(
      [inputRuleId, promptRuleId].sort(),
    );
    expect(body.regex.deferred.map((item: { ruleId: string }) => item.ruleId)).toEqual([
      deferredRuleId,
    ]);
    expect(body.regex.skipped).toHaveLength(1);
    expect(body.regex.skipped[0].reason).toBe("not-found");

    const replay = await app.inject({
      method: "POST",
      url: "/api/prompt/preview",
      headers: { cookie: owner.cookie },
      payload: {
        conversationId: fixture.conversationId,
        branchId: fixture.branchId,
        characterId: fixture.characterId,
        userInput: "雨夜里我想去书店。",
        lorebookIds: [fixture.lorebookId],
        regexRuleIds: [inputRuleId, promptRuleId, deferredRuleId, randomUUID()],
        maxOutputTokens: 200,
        contextWindowTokens: 4096,
        seed: 5,
      },
    });
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json().plan.digest).toBe(body.plan.digest);
  });

  it("triggers world info entries with a safe regex pattern", async () => {
    const owner = await register(app);
    const fixture = await createPreviewFixture(app, owner.cookie);

    const book = await app.inject({
      method: "POST",
      url: "/api/lorebooks",
      headers: { cookie: owner.cookie },
      payload: { title: "正则触发世界书" },
    });
    expect(book.statusCode, book.body).toBe(201);
    const bookId = (book.json() as { id: string }).id;

    const created = await app.inject({
      method: "POST",
      url: `/api/lorebooks/${bookId}/entries`,
      headers: { cookie: owner.cookie },
      payload: {
        content: "正则命中的设定：月光会显影旧字。",
        matchMode: "regex",
        regexPattern: "铜灯|月光",
        regexFlags: "",
        keys: [],
        enabled: true,
        sortKey: 1,
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const createdBody = created.json() as { rule: { matchMode: string; regexPattern: string } };
    expect(createdBody.rule.matchMode).toBe("regex");
    expect(createdBody.rule.regexPattern).toBe("铜灯|月光");

    const preview = await app.inject({
      method: "POST",
      url: "/api/prompt/preview",
      headers: { cookie: owner.cookie },
      payload: {
        conversationId: fixture.conversationId,
        branchId: fixture.branchId,
        characterId: fixture.characterId,
        userInput: "月光落在柜台上。",
        lorebookIds: [bookId],
        maxOutputTokens: 200,
        contextWindowTokens: 4096,
        seed: 3,
      },
    });
    expect(preview.statusCode, preview.body).toBe(200);
    const body = preview.json();
    expect(body.worldInfo.activated).toHaveLength(1);
    expect(body.worldInfo.activated[0].content).toContain("月光会显影旧字");
    expect(body.worldInfo.activated[0].matchedKeys).toEqual(["铜灯|月光"]);

    const invalid = await app.inject({
      method: "POST",
      url: `/api/lorebooks/${bookId}/entries`,
      headers: { cookie: owner.cookie },
      payload: {
        content: "不该保存",
        matchMode: "regex",
        regexPattern: "(a+)+$",
        keys: [],
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe("REGEX_INVALID");
  });

  it("validates regex mutations and persists the replacement text", async () => {
    const owner = await register(app);
    const ruleId = randomUUID();

    const invalid = await app.inject({
      method: "POST",
      url: "/api/mutations",
      headers: { cookie: owner.cookie },
      payload: {
        mutations: [
          {
            opId: `op-${randomUUID()}`,
            entityType: "regex_rule",
            entityId: randomUUID(),
            expectedRevision: null,
            action: "upsert",
            payload: {
              title: "不安全",
              stage: "user_input",
              pattern: "(x+)+",
              replacement: "",
            },
          },
        ],
      },
    });
    expect(invalid.statusCode, invalid.body).toBe(200);
    expect(invalid.json().results[0].status).toBe("rejected");
    expect(invalid.json().results[0].code).toBe("INVALID_PATTERN");

    const accepted = await app.inject({
      method: "POST",
      url: "/api/mutations",
      headers: { cookie: owner.cookie },
      payload: {
        mutations: [
          {
            opId: `op-${randomUUID()}`,
            entityType: "regex_rule",
            entityId: ruleId,
            expectedRevision: null,
            action: "upsert",
            payload: {
              title: "同步规则",
              stage: "user_input",
              pattern: "a",
              replacement: "b",
            },
          },
        ],
      },
    });
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(accepted.json().results[0].status).toBe("accepted");

    const fetched = await app.inject({
      method: "GET",
      url: `/api/regex-rules/${ruleId}`,
      headers: { cookie: owner.cookie },
    });
    expect(fetched.statusCode).toBe(200);
    expect((fetched.json() as { replacement: string }).replacement).toBe("b");
  });
});
