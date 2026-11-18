import {
  addCharacterVersionRequestSchema,
  type CharacterDetail,
  type CharacterSummaryDto,
  type CharacterVersionDto,
  type CharacterVersionResponse,
  createCharacterRequestSchema,
  type SourceFormat,
} from "@xuyueji/contracts";
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

    app.get("/:characterId", guard, async (request) => {
      const session = requireSession(request);
      const { characterId } = paramsSchema.parse(request.params);
      const result = await getCharacter(db, session.userId, characterId);
      return detailDto(result.character, result.versions);
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
