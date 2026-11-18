import type { SyncPullResponse } from "@xuyueji/contracts";
import { and, asc, eq, gt } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAuth, requireSession } from "../auth/guard.js";
import type { AuthService } from "../auth/service.js";
import type { Database } from "../db/client.js";
import { syncChanges } from "../db/schema.js";
import { decodeCursor, encodeCursor, InvalidCursorError } from "../sync/cursor.js";
import { toIso } from "../time.js";

const PAGE_SIZE = 200;

const syncQuerySchema = z.object({
  cursor: z.string().min(1).max(200).optional(),
});

export function syncRoutes(options: {
  readonly db: Database;
  readonly auth: AuthService;
}): FastifyPluginAsync {
  const { db, auth } = options;

  return async (app) => {
    app.get("/", { preHandler: requireAuth(auth) }, async (request, reply) => {
      const session = requireSession(request);
      const query = syncQuerySchema.parse(request.query);

      let cursor: number;
      try {
        cursor = decodeCursor(query.cursor);
      } catch (error) {
        if (error instanceof InvalidCursorError) {
          return reply.code(400).send({
            error: {
              code: "INVALID_CURSOR",
              message: "The sync cursor is malformed; rebuild the local cache.",
              requestId: request.id,
            },
          });
        }
        throw error;
      }

      const rows = await db
        .select()
        .from(syncChanges)
        .where(and(eq(syncChanges.ownerUserId, session.userId), gt(syncChanges.sequence, cursor)))
        .orderBy(asc(syncChanges.sequence))
        .limit(PAGE_SIZE + 1);

      const hasMore = rows.length > PAGE_SIZE;
      const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
      const last = page.at(-1);

      const response: SyncPullResponse = {
        changes: page.map((row) => ({
          sequence: row.sequence,
          entityType: row.entityType as SyncPullResponse["changes"][number]["entityType"],
          entityId: row.entityId,
          revision: row.revision,
          op: row.op === "delete" ? "delete" : "upsert",
          changedAt: toIso(row.changedAt),
        })),
        nextCursor: encodeCursor(last?.sequence ?? cursor),
        hasMore,
        serverTime: new Date().toISOString(),
        resyncRequired: false,
      };
      return response;
    });
  };
}
