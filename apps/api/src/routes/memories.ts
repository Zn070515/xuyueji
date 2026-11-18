import {
  createMemoryRequestSchema,
  type MemoryItemDto,
  updateMemoryRequestSchema,
} from "@xuyueji/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAuth, requireSession } from "../auth/guard.js";
import type { AuthService } from "../auth/service.js";
import type { Database } from "../db/client.js";
import {
  createMemory,
  deleteMemory,
  getMemory,
  listMemories,
  updateMemory,
} from "../repositories/memories.js";

const paramsSchema = z.object({ memoryId: z.string().min(1).max(100) });
const listQuerySchema = z.object({ conversationId: z.uuid().optional() });

export function memoryRoutes(options: {
  readonly db: Database;
  readonly auth: AuthService;
}): FastifyPluginAsync {
  const { db, auth } = options;
  const guard = { preHandler: requireAuth(auth) };

  return async (app) => {
    app.get("/", guard, async (request) => {
      const session = requireSession(request);
      const query = listQuerySchema.parse(request.query);
      return { memories: await listMemories(db, session.userId, query.conversationId) };
    });

    app.post("/", guard, async (request, reply) => {
      const session = requireSession(request);
      const body = createMemoryRequestSchema.parse(request.body);
      const created = await createMemory(db, {
        ownerUserId: session.userId,
        kind: body.kind,
        content: body.content,
        conversationId: body.conversationId ?? null,
        scope: body.scope ?? "conversation",
        locked: body.locked ?? false,
        now: new Date().toISOString(),
      });
      reply.code(201);
      const response: MemoryItemDto = created;
      return response;
    });

    app.get("/:memoryId", guard, async (request) => {
      const session = requireSession(request);
      const { memoryId } = paramsSchema.parse(request.params);
      return getMemory(db, session.userId, memoryId);
    });

    app.patch("/:memoryId", guard, async (request) => {
      const session = requireSession(request);
      const { memoryId } = paramsSchema.parse(request.params);
      const body = updateMemoryRequestSchema.parse(request.body);
      const updated = await updateMemory(db, {
        ownerUserId: session.userId,
        memoryId,
        kind: body.kind,
        content: body.content,
        conversationId: body.conversationId,
        scope: body.scope ?? "conversation",
        locked: body.locked ?? false,
        expectedRevision: body.expectedRevision,
        now: new Date().toISOString(),
      });
      const response: MemoryItemDto = updated;
      return response;
    });

    app.delete("/:memoryId", guard, async (request, reply) => {
      const session = requireSession(request);
      const { memoryId } = paramsSchema.parse(request.params);
      await deleteMemory(db, {
        ownerUserId: session.userId,
        memoryId,
        now: new Date().toISOString(),
      });
      return reply.code(204).send();
    });
  };
}
