import {
  createRegexRuleRequestSchema,
  type RegexRuleDto,
  type RegexTestResponse,
  regexTestRequestSchema,
  updateRegexRuleRequestSchema,
} from "@xuyueji/contracts";
import { applySafeRegex, compileSafeRegex, type SafeRegexLimits } from "@xuyueji/tavern-core";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAuth, requireSession } from "../auth/guard.js";
import type { AuthService } from "../auth/service.js";
import type { Database } from "../db/client.js";
import {
  createRegexRule,
  deleteRegexRule,
  getRegexRule,
  listRegexRules,
  updateRegexRule,
} from "../repositories/regex-rules.js";

const paramsSchema = z.object({ ruleId: z.string().min(1).max(100) });

export const RULE_REGEX_LIMITS: SafeRegexLimits = {
  maxPatternLength: 2_000,
  maxInputLength: 100_000,
  maxSteps: 250_000,
  maxMatches: 5_000,
  maxProgramSize: 20_000,
};

/**
 * Rejects a pattern before it is stored. `compileSafeRegex` is pure and
 * bounded, so this never runs unbounded work on untrusted input.
 */
export function assertStoredPattern(pattern: string, flags: string): void {
  compileSafeRegex(pattern, flags, RULE_REGEX_LIMITS);
}

export function regexRuleRoutes(options: {
  readonly db: Database;
  readonly auth: AuthService;
}): FastifyPluginAsync {
  const { db, auth } = options;
  const guard = { preHandler: requireAuth(auth) };

  return async (app) => {
    app.get("/", guard, async (request) => {
      const session = requireSession(request);
      return { rules: await listRegexRules(db, session.userId) };
    });

    app.post("/test", { ...guard, bodyLimit: 1024 * 1024 }, async (request) => {
      const body = regexTestRequestSchema.parse(request.body);
      const flags = body.flags ?? "";
      assertStoredPattern(body.pattern, flags);
      const result = applySafeRegex(
        body.sample,
        { pattern: body.pattern, flags, replacement: body.replacement ?? "" },
        RULE_REGEX_LIMITS,
      );
      const response: RegexTestResponse = {
        output: result.output,
        matchCount: result.matchCount,
        steps: result.steps,
      };
      return response;
    });

    app.post("/", guard, async (request, reply) => {
      const session = requireSession(request);
      const body = createRegexRuleRequestSchema.parse(request.body);
      const flags = body.flags ?? "";
      assertStoredPattern(body.pattern, flags);
      const created = await createRegexRule(db, {
        ownerUserId: session.userId,
        title: body.title,
        stage: body.stage,
        pattern: body.pattern,
        flags,
        replacement: body.replacement ?? "",
        sortOrder: body.sortOrder ?? 0,
        enabled: body.enabled ?? true,
        now: new Date().toISOString(),
      });
      reply.code(201);
      const response: RegexRuleDto = created;
      return response;
    });

    app.get("/:ruleId", guard, async (request) => {
      const session = requireSession(request);
      const { ruleId } = paramsSchema.parse(request.params);
      return getRegexRule(db, session.userId, ruleId);
    });

    app.patch("/:ruleId", guard, async (request) => {
      const session = requireSession(request);
      const { ruleId } = paramsSchema.parse(request.params);
      const body = updateRegexRuleRequestSchema.parse(request.body);
      const flags = body.flags ?? "";
      assertStoredPattern(body.pattern, flags);
      const updated = await updateRegexRule(db, {
        ownerUserId: session.userId,
        ruleId,
        title: body.title,
        stage: body.stage,
        pattern: body.pattern,
        flags,
        replacement: body.replacement ?? "",
        sortOrder: body.sortOrder ?? 0,
        enabled: body.enabled ?? true,
        expectedRevision: body.expectedRevision,
        now: new Date().toISOString(),
      });
      const response: RegexRuleDto = updated;
      return response;
    });

    app.delete("/:ruleId", guard, async (request, reply) => {
      const session = requireSession(request);
      const { ruleId } = paramsSchema.parse(request.params);
      await deleteRegexRule(db, {
        ownerUserId: session.userId,
        ruleId,
        now: new Date().toISOString(),
      });
      return reply.code(204).send();
    });
  };
}
