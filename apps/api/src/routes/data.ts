import { characterPayloadSchema, messageDtoSchema } from "@xuyueji/contracts";
import { InvariantViolationError } from "@xuyueji/domain";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAuth, requireSession } from "../auth/guard.js";
import type { AuthService } from "../auth/service.js";
import type { Database } from "../db/client.js";
import { exportUserData, type ImportBundle, importUserData } from "../repositories/user-data.js";

const importCharacterSchema = z.object({
  id: z.string().min(1),
  activeVersionId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  versions: z
    .array(
      z.object({
        id: z.string().min(1),
        revision: z.number().int().positive(),
        sourceFormat: z.string(),
        payload: characterPayloadSchema,
        createdAt: z.string(),
      }),
    )
    .min(1),
});

const importConversationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  mode: z.enum(["solo", "group"]),
  activeBranchId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  branches: z.array(
    z.object({
      id: z.string().min(1),
      headMessageId: z.string().nullable(),
      revision: z.number().int().nonnegative(),
      label: z.string(),
      createdAt: z.string(),
    }),
  ),
  messages: z.array(messageDtoSchema),
});

const importBodySchema = z.object({
  manifest: z.object({
    format: z.literal("xuyueji-export-json"),
    version: z.literal(1),
    exportedAt: z.string().optional(),
  }),
  characters: z.array(importCharacterSchema).default([]),
  conversations: z.array(importConversationSchema).default([]),
  personas: z.array(z.unknown()).default([]),
  lorebooks: z.array(z.unknown()).default([]),
  presets: z.array(z.unknown()).default([]),
  regexRules: z.array(z.unknown()).default([]),
  memoryItems: z.array(z.unknown()).default([]),
});

export function dataRoutes(options: {
  readonly db: Database;
  readonly auth: AuthService;
}): FastifyPluginAsync {
  const { db, auth } = options;
  const guard = { preHandler: requireAuth(auth) };

  return async (app) => {
    app.get("/export", guard, async (request, reply) => {
      const session = requireSession(request);
      const bundle = await exportUserData(db, session.userId);
      const stamp = bundle.manifest.exportedAt.slice(0, 10);
      reply.header("content-disposition", `attachment; filename="xuyueji-export-${stamp}.json"`);
      reply.type("application/json; charset=utf-8");
      return bundle;
    });

    app.post("/import", { ...guard, bodyLimit: 20 * 1024 * 1024 }, async (request) => {
      const session = requireSession(request);
      const body = importBodySchema.parse(request.body);
      if (body.manifest.format !== "xuyueji-export-json") {
        throw new InvariantViolationError("Unsupported import manifest.", {
          format: body.manifest.format,
        });
      }

      const counts = await importUserData(
        db,
        session.userId,
        body as unknown as ImportBundle,
        new Date().toISOString(),
      );

      return {
        imported: counts,
        note:
          counts.skipped > 0
            ? "Persona/lorebook/preset/regex/memory import is not yet implemented; those arrays were counted as skipped."
            : "Import created new ids under the authenticated account; it never overwrote existing rows.",
      };
    });
  };
}
