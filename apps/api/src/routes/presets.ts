import {
  createPresetRequestSchema,
  type PresetDetailDto,
  updatePresetRequestSchema,
} from "@xuyueji/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAuth, requireSession } from "../auth/guard.js";
import type { AuthService } from "../auth/service.js";
import type { Database } from "../db/client.js";
import {
  createPreset,
  deletePreset,
  getPreset,
  listPresets,
  updatePreset,
} from "../repositories/presets.js";

const paramsSchema = z.object({ presetId: z.string().min(1).max(100) });

export function presetRoutes(options: {
  readonly db: Database;
  readonly auth: AuthService;
}): FastifyPluginAsync {
  const { db, auth } = options;
  const guard = { preHandler: requireAuth(auth) };

  return async (app) => {
    app.get("/", guard, async (request) => {
      const session = requireSession(request);
      return { presets: await listPresets(db, session.userId) };
    });

    app.post("/", { ...guard, bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
      const session = requireSession(request);
      const body = createPresetRequestSchema.parse(request.body);
      const created = await createPreset(db, {
        ownerUserId: session.userId,
        title: body.title,
        sections: body.sections,
        enabled: body.enabled ?? true,
        now: new Date().toISOString(),
      });
      reply.code(201);
      const response: PresetDetailDto = created;
      return response;
    });

    app.get("/:presetId", guard, async (request) => {
      const session = requireSession(request);
      const { presetId } = paramsSchema.parse(request.params);
      return getPreset(db, session.userId, presetId);
    });

    app.patch("/:presetId", { ...guard, bodyLimit: 2 * 1024 * 1024 }, async (request) => {
      const session = requireSession(request);
      const { presetId } = paramsSchema.parse(request.params);
      const body = updatePresetRequestSchema.parse(request.body);
      const updated = await updatePreset(db, {
        ownerUserId: session.userId,
        presetId,
        title: body.title,
        sections: body.sections,
        enabled: body.enabled,
        expectedRevision: body.expectedRevision,
        now: new Date().toISOString(),
      });
      const response: PresetDetailDto = updated;
      return response;
    });

    app.delete("/:presetId", guard, async (request, reply) => {
      const session = requireSession(request);
      const { presetId } = paramsSchema.parse(request.params);
      await deletePreset(db, {
        ownerUserId: session.userId,
        presetId,
        now: new Date().toISOString(),
      });
      return reply.code(204).send();
    });
  };
}
