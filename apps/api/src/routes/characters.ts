import { parseCharacterCard, parseCharacterCardPng, serializeCharacterCard } from "@xuyueji/compat";
import {
  addCharacterVersionRequestSchema,
  type CharacterCardImportReport,
  type CharacterCardImportResponse,
  type CharacterDetail,
  type CharacterPayloadDto,
  type CharacterSummaryDto,
  type CharacterVersionDto,
  type CharacterVersionResponse,
  characterExportFormatSchema,
  createCharacterRequestSchema,
  importCharacterCardRequestSchema,
  type SourceFormat,
} from "@xuyueji/contracts";
import { type CharacterPayload, InvariantViolationError } from "@xuyueji/domain";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth, requireSession } from "../auth/guard.js";
import type { AuthService } from "../auth/service.js";
import type { Database } from "../db/client.js";
import type { CharacterRow, CharacterVersionRow } from "../repositories/characters.js";
import {
  addCharacterVersion,
  createCharacter,
  deleteCharacter,
  getCharacter,
  listCharacters,
  toCharacterSummary,
} from "../repositories/characters.js";
import { toIso } from "../time.js";

const paramsSchema = z.object({ characterId: z.string().min(1).max(100) });
const exportQuerySchema = z.object({ format: characterExportFormatSchema.default("v2") });

function asSourceFormat(value: string): SourceFormat {
  return value === "v2" || value === "v3" ? value : "native";
}

function versionDto(row: CharacterVersionRow): CharacterVersionDto {
  return {
    id: row.id,
    revision: row.revision,
    sourceFormat: asSourceFormat(row.sourceFormat),
    createdAt: toIso(row.createdAt),
    payload: row.payloadJsonb as CharacterVersionDto["payload"],
  };
}

function summaryDto(character: CharacterRow, versions: CharacterVersionRow[]): CharacterSummaryDto {
  const active = versions.find((version) => version.id === character.activeVersionId);
  return toCharacterSummary(character, active);
}

function detailDto(character: CharacterRow, versions: CharacterVersionRow[]): CharacterDetail {
  return {
    character: summaryDto(character, versions),
    versions: versions.map(versionDto),
  };
}

function toCardPayload(payload: CharacterPayload): CharacterPayloadDto {
  return {
    name: payload.name,
    description: payload.description,
    personality: payload.personality,
    scenario: payload.scenario,
    firstMessage: payload.firstMessage,
    alternateGreetings: payload.alternateGreetings ? [...payload.alternateGreetings] : undefined,
    exampleMessages: payload.exampleMessages ? [...payload.exampleMessages] : undefined,
    systemPrompt: payload.systemPrompt,
    postHistoryInstructions: payload.postHistoryInstructions,
    tags: payload.tags ? [...payload.tags] : undefined,
    creatorNotes: payload.creatorNotes,
    extensions: payload.extensions ? { ...payload.extensions } : undefined,
    avatarAssetId: payload.avatarAssetId,
  };
}

export function characterRoutes(options: {
  readonly db: Database;
  readonly auth: AuthService;
}): FastifyPluginAsync {
  const { db, auth } = options;
  const guard = { preHandler: requireAuth(auth) };

  return async (app) => {
    app.get("/", guard, async (request) => {
      const session = requireSession(request);
      return { characters: await listCharacters(db, session.userId) };
    });

    app.post("/", guard, async (request, reply) => {
      const session = requireSession(request);
      const body = createCharacterRequestSchema.parse(request.body);
      const now = new Date().toISOString();
      const created = await createCharacter(db, {
        ownerUserId: session.userId,
        payload: body.payload,
        sourceFormat: body.sourceFormat ?? "native",
        now,
      });
      reply.code(201);
      return detailDto(created.character, [created.version]);
    });

    app.post("/import", { ...guard, bodyLimit: 25 * 1024 * 1024 }, async (request, reply) => {
      const session = requireSession(request);
      const body = importCharacterCardRequestSchema.parse(request.body);
      const parsed =
        body.kind === "json"
          ? parseCharacterCard(body.card)
          : parseCharacterCardPng(new Uint8Array(Buffer.from(body.base64, "base64")));

      const now = new Date().toISOString();
      const created = await createCharacter(db, {
        ownerUserId: session.userId,
        payload: toCardPayload(parsed.payload),
        sourceFormat: parsed.format,
        now,
      });

      const report: CharacterCardImportReport = {
        format: parsed.format,
        specVersion: parsed.specVersion,
        warnings: [...parsed.warnings],
        unknownTopLevelFields: Object.keys(parsed.rawUnknown.topLevel).length,
        unknownDataFields: Object.keys(parsed.rawUnknown.data).length,
      };
      const response: CharacterCardImportResponse = {
        character: detailDto(created.character, [created.version]),
        report,
      };
      reply.code(201);
      return response;
    });

    app.get("/:characterId", guard, async (request) => {
      const session = requireSession(request);
      const { characterId } = paramsSchema.parse(request.params);
      const result = await getCharacter(db, session.userId, characterId);
      return detailDto(result.character, result.versions);
    });

    app.get("/:characterId/export", guard, async (request, reply) => {
      const session = requireSession(request);
      const { characterId } = paramsSchema.parse(request.params);
      const query = exportQuerySchema.parse(request.query);
      const result = await getCharacter(db, session.userId, characterId);
      const active = result.versions.find(
        (version) => version.id === result.character.activeVersionId,
      );
      if (!active) {
        throw new InvariantViolationError("Character has no active version.", {
          characterId,
        });
      }

      const card = serializeCharacterCard(active.payloadJsonb as unknown as CharacterPayload, {
        format: query.format,
      });
      reply.header(
        "content-disposition",
        `attachment; filename="character-${characterId}-${query.format}.json"`,
      );
      reply.type("application/json; charset=utf-8");
      return card;
    });

    app.post("/:characterId/versions", guard, async (request) => {
      const session = requireSession(request);
      const { characterId } = paramsSchema.parse(request.params);
      const body = addCharacterVersionRequestSchema.parse(request.body);
      const created = await addCharacterVersion(db, {
        ownerUserId: session.userId,
        characterId,
        expectedActiveVersionId: body.expectedActiveVersionId,
        payload: body.payload,
        sourceFormat: body.sourceFormat ?? "native",
        now: new Date().toISOString(),
      });
      const detail = await getCharacter(db, session.userId, characterId);
      const response: CharacterVersionResponse = {
        characterId,
        activeVersionId: created.character.activeVersionId ?? created.version.id,
        revision: created.version.revision,
        versionCount: detail.versions.length,
      };
      return response;
    });

    app.delete("/:characterId", guard, async (request, reply) => {
      const session = requireSession(request);
      const { characterId } = paramsSchema.parse(request.params);
      await deleteCharacter(db, {
        ownerUserId: session.userId,
        characterId,
        now: new Date().toISOString(),
      });
      return reply.code(204).send();
    });
  };
}
