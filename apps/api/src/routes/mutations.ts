import { type SyncMutationResponse, syncMutationEnvelopeSchema } from "@xuyueji/contracts";
import type { FastifyPluginAsync } from "fastify";

import { requireAuth, requireSession } from "../auth/guard.js";
import type { AuthService } from "../auth/service.js";
import type { Database } from "../db/client.js";
import { applyMutations } from "../repositories/mutations.js";

export function mutationRoutes(options: {
  readonly db: Database;
  readonly auth: AuthService;
}): FastifyPluginAsync {
  const { db, auth } = options;

  return async (app) => {
    app.post("/mutations", { preHandler: requireAuth(auth) }, async (request) => {
      const session = requireSession(request);
      const body = syncMutationEnvelopeSchema.parse(request.body);
      const results = await applyMutations(db, session.userId, body.mutations);
      const response: SyncMutationResponse = { results };
      return response;
    });
  };
}
