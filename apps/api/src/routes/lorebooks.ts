import {
  createLorebookRequestSchema,
  type LorebookDetailDto,
  type LorebookSummaryDto,
  lorebookEntryInputSchema,
  updateLorebookEntryRequestSchema,
  updateLorebookRequestSchema,
} from "@xuyueji/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAuth, requireSession } from "../auth/guard.js";
import type { AuthService } from "../auth/service.js";
import type { Database } from "../db/client.js";
import {
  createLorebook,
  createLoreEntry,
  deleteLorebook,
  deleteLoreEntry,
  getLorebook,
  listLorebooks,
  updateLorebook,
  updateLoreEntry,
} from "../repositories/lorebooks.js";

const bookParamsSchema = z.object({ lorebookId: z.string().min(1).max(100) });
const entryParamsSchema = z.object({
  lorebookId: z.string().min(1).max(100),
  entryId: z.string().min(1).max(100),
});

export function lorebookRoutes(options: {
  readonly db: Database;
  readonly auth: AuthService;
}): FastifyPluginAsync {
  const { db, auth } = options;
  const guard = { preHandler: requireAuth(auth) };

  return async (app) => {
    app.get("/", guard, async (request) => {
      const session = requireSession(request);
      return { lorebooks: await listLorebooks(db, session.userId) };
    });

    app.post("/", guard, async (request, reply) => {
      const session = requireSession(request);
      const body = createLorebookRequestSchema.parse(request.body);
      const created = await createLorebook(db, {
        ownerUserId: session.userId,
        title: body.title,
        now: new Date().toISOString(),
      });
      reply.code(201);
      const response: LorebookSummaryDto = created;
      return response;
    });

    app.get("/:lorebookId", guard, async (request) => {
      const session = requireSession(request);
      const { lorebookId } = bookParamsSchema.parse(request.params);
      const detail = await getLorebook(db, session.userId, lorebookId);
      const response: LorebookDetailDto = detail;
      return response;
    });

    app.patch("/:lorebookId", guard, async (request) => {
      const session = requireSession(request);
      const { lorebookId } = bookParamsSchema.parse(request.params);
      const body = updateLorebookRequestSchema.parse(request.body);
      return updateLorebook(db, {
        ownerUserId: session.userId,
        lorebookId,
        title: body.title,
        expectedRevision: body.expectedRevision,
        now: new Date().toISOString(),
      });
    });

    app.delete("/:lorebookId", guard, async (request, reply) => {
      const session = requireSession(request);
      const { lorebookId } = bookParamsSchema.parse(request.params);
      await deleteLorebook(db, {
        ownerUserId: session.userId,
        lorebookId,
        now: new Date().toISOString(),
      });
      return reply.code(204).send();
    });

    app.post(
      "/:lorebookId/entries",
      { ...guard, bodyLimit: 256 * 1024 },
      async (request, reply) => {
        const session = requireSession(request);
        const { lorebookId } = bookParamsSchema.parse(request.params);
        const entry = lorebookEntryInputSchema.parse(request.body);
        const created = await createLoreEntry(db, {
          ownerUserId: session.userId,
          lorebookId,
          entry,
          now: new Date().toISOString(),
        });
        reply.code(201);
        return created;
      },
    );

    app.patch(
      "/:lorebookId/entries/:entryId",
      { ...guard, bodyLimit: 256 * 1024 },
      async (request) => {
        const session = requireSession(request);
        const { lorebookId, entryId } = entryParamsSchema.parse(request.params);
        const body = updateLorebookEntryRequestSchema.parse(request.body);
        return updateLoreEntry(db, {
          ownerUserId: session.userId,
          lorebookId,
          entryId,
          expectedRevision: body.expectedRevision,
          entry: body,
          now: new Date().toISOString(),
        });
      },
    );

    app.delete("/:lorebookId/entries/:entryId", guard, async (request, reply) => {
      const session = requireSession(request);
      const { lorebookId, entryId } = entryParamsSchema.parse(request.params);
      await deleteLoreEntry(db, {
        ownerUserId: session.userId,
        lorebookId,
        entryId,
        now: new Date().toISOString(),
      });
      return reply.code(204).send();
    });
  };
}
