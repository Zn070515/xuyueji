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

async function register(app: FastifyInstance): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: `macro-${randomUUID()}@example.com`,
      password: PASSWORD,
      displayName: "宏测试",
      ageConfirmed: true,
    },
  });
  expect(response.statusCode, response.body).toBe(201);
  const setCookie = response.headers["set-cookie"];
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return (first as string).split(";")[0] as string;
}

describeWithDatabase("M2 macro pipeline", () => {
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
      MOCK_PAYMENT_SECRET: "macro-test-secret",
    });
    app = await buildApp({ config, logger: false, database });
  });

  afterAll(async () => {
    await app.close();
    await database.pool.end();
  });

  it("expands whitelisted macros in preset, persona and user input", async () => {
    const cookie = await register(app);

    const character = await app.inject({
      method: "POST",
      url: "/api/characters",
      headers: { cookie },
      payload: {
        payload: {
          name: "阿岚",
          description: "{{char}}是守夜人，把{{user}}当作客人。",
        },
      },
    });
    expect(character.statusCode, character.body).toBe(201);
    const characterId = (character.json() as { character: { id: string } }).character.id;

    const conversation = await app.inject({
      method: "POST",
      url: "/api/conversations",
      headers: { cookie },
      payload: { title: "宏会话" },
    });
    const created = conversation.json() as { id: string; activeBranchId: string };

    const persona = await app.inject({
      method: "POST",
      url: "/api/personas",
      headers: { cookie },
      payload: { displayName: "夜行者", description: "{{user}}带着一盏灯。" },
    });
    expect(persona.statusCode, persona.body).toBe(201);
    const personaId = (persona.json() as { persona: { id: string } }).persona.id;

    const preset = await app.inject({
      method: "POST",
      url: "/api/presets",
      headers: { cookie },
      payload: {
        title: "宏预设",
        sections: [
          {
            id: "style",
            title: "风格",
            content: "{{char}} 对 {{user}} 说话，语气是 {{random::温和::冷淡}}。",
            enabled: true,
            order: 1,
            depth: 0,
          },
        ],
      },
    });
    expect(preset.statusCode, preset.body).toBe(201);
    const presetId = (preset.json() as { preset: { id: string } }).preset.id;

    const payload = {
      conversationId: created.id,
      branchId: created.activeBranchId,
      characterId,
      personaId,
      presetId,
      userInput: "{{char}}，{{user}}来了。{{unknown}}",
      maxOutputTokens: 200,
      contextWindowTokens: 4096,
      seed: 4,
    };
    const preview = await app.inject({
      method: "POST",
      url: "/api/prompt/preview",
      headers: { cookie },
      payload,
    });
    expect(preview.statusCode, preview.body).toBe(200);
    const body = preview.json();

    expect(body.plan.systemPrompt).toContain("阿岚是守夜人，把夜行者当作客人。");
    expect(body.plan.systemPrompt).toContain("夜行者带着一盏灯。");
    expect(body.plan.systemPrompt).toContain("阿岚 对 夜行者 说话");
    expect(body.plan.messages.at(-1)).toEqual({
      role: "user",
      content: "阿岚，夜行者来了。{{unknown}}",
    });
    expect(body.macros.used.sort()).toEqual(["char", "random", "user"]);
    expect(body.macros.warnings.join(" ")).toMatch(/Unknown macro/);
    expect(body.plan.warnings.join(" ")).toMatch(/Unknown macro/);

    const replay = await app.inject({
      method: "POST",
      url: "/api/prompt/preview",
      headers: { cookie },
      payload,
    });
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json().plan.digest).toBe(body.plan.digest);
    expect(replay.json().plan.systemPrompt).toBe(body.plan.systemPrompt);
  });
});
