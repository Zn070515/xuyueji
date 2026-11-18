import {
  addPersonaVersionRequestSchema,
  createPersonaRequestSchema,
  type PersonaDetailDto,
  type PersonaVersionResponse,
} from "@xuyueji/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAuth, requireSession } from "../auth/guard.js";
import type { AuthService } from "../auth/service.js";
import type { Database } from "../db/client.js";
import {
  addPersonaVersion,
  createPersona,
  deletePersona,
  getPersona,
  listPersonas,
} from "../repositories/personas.js";

const paramsSchema = z.object({ personaId: z.string().min(1).max(100) });

export function personaRoutes(options: {
  readonly db: Database;
  readonly auth: AuthService;
}): FastifyPluginAsync {
  const { db, auth } = options;
  const guard = { preHandler: requireAuth(auth) };

  return async (app) => {
    app.get("/", guard, async (request) => {
      const session = requireSession(request);
      return { personas: await listPersonas(db, session.userId) };
    });

    app.post("/", guard, async (request, reply) => {
      const session = requireSession(request);
      const body = createPersonaRequestSchema.parse(request.body);
      const created = await createPersona(db, {
        ownerUserId: session.userId,
        payload: body,
        now: new Date().toISOString(),
      });
      reply.code(201);
      const response: PersonaDetailDto = created;
      return response;
    });

    app.get("/:personaId", guard, async (request) => {
      const session = requireSession(request);
      const { personaId } = paramsSchema.parse(request.params);
      return getPersona(db, session.userId, personaId);
    });

    app.post("/:personaId/versions", guard, async (request) => {
      const session = requireSession(request);
      const { personaId } = paramsSchema.parse(request.params);
      const body = addPersonaVersionRequestSchema.parse(request.body);
      const created = await addPersonaVersion(db, {
        ownerUserId: session.userId,
        personaId,
        expectedActiveVersionId: body.expectedActiveVersionId,
        payload: body.payload,
        now: new Date().toISOString(),
      });
      const response: PersonaVersionResponse = {
        personaId,
        activeVersionId: created.version.id,
        revision: created.version.revision,
        versionCount: created.versionCount,
      };
      return response;
    });

    app.delete("/:personaId", guard, async (request, reply) => {
      const session = requireSession(request);
      const { personaId } = paramsSchema.parse(request.params);
      await deletePersona(db, {
        ownerUserId: session.userId,
        personaId,
        now: new Date().toISOString(),
      });
      return reply.code(204).send();
    });
  };
}
