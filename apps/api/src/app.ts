import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { CharacterCardParseError } from "@xuyueji/compat";
import { DomainError, type DomainErrorCode } from "@xuyueji/domain";
import { PromptBudgetExceededError } from "@xuyueji/prompt-engine";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";

import { AuthError } from "./auth/errors.js";
import { authRoutes } from "./auth/routes.js";
import { AuthService } from "./auth/service.js";
import type { AppConfig } from "./config.js";
import { createDatabase, type DatabaseHandle } from "./db/client.js";
import { createDemoStore } from "./demo-store.js";
import { characterRoutes } from "./routes/characters.js";
import { conversationRoutes } from "./routes/conversations.js";
import { dataRoutes } from "./routes/data.js";
import { demoRoutes } from "./routes/demo.js";
import { healthRoutes } from "./routes/health.js";
import { lorebookRoutes } from "./routes/lorebooks.js";
import { metaRoutes } from "./routes/meta.js";
import { mutationRoutes } from "./routes/mutations.js";
import { promptRoutes } from "./routes/prompt.js";
import { syncRoutes } from "./routes/sync.js";

const STATUS_BY_CODE: Readonly<Record<DomainErrorCode, number>> = {
  VERSION_CONFLICT: 409,
  INVARIANT_VIOLATION: 422,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  INSUFFICIENT_POINTS: 402,
  INVALID_STATE_TRANSITION: 409,
  PAYMENT_REJECTED: 400,
};

export interface BuildAppOptions {
  readonly config: AppConfig;
  readonly logger?: boolean;
  readonly database?: DatabaseHandle;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options;

  // M0 has no production authentication, storage or payment path. Refusing to
  // start is safer than serving demo endpoints under a production banner.
  if (!config.demoMode) {
    throw new Error(
      "M0 only supports demo mode. Keep DEMO_MODE=true until M1 authentication and M3 provider/billing exist.",
    );
  }

  const store = createDemoStore(config.mockPaymentSecret);
  const database =
    options.database ?? (config.databaseUrl ? createDatabase(config.databaseUrl) : null);
  const ownsDatabase = options.database === undefined && database !== null;

  const app = Fastify({
    logger: options.logger
      ? {
          level: "info",
          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              "res.headers.set-cookie",
              "*.apiKey",
              "*.api_key",
              "*.authorization",
              "*.signature",
            ],
            censor: "[redacted]",
          },
        }
      : false,
    bodyLimit: 1024 * 1024,
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
    trustProxy: config.trustProxy,
  });

  await app.register(cookie);
  app.decorateRequest("auth", null);

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  });
  await app.register(rateLimit, {
    global: true,
    max: config.rateLimitMax,
    timeWindow: "1 minute",
  });

  if (config.demoMode) {
    await app.register(cors, {
      origin: [...config.corsOrigins],
      credentials: false,
    });
  }

  // Cookie-authenticated writes need a CSRF defence beyond SameSite. Requests
  // without an Origin header are non-browser clients/webhooks; browsers send
  // it, and a cross-site Origin must match the configured/ same-host set.
  app.addHook("onRequest", async (request, reply) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      return;
    }
    const origin = request.headers.origin;
    if (!origin) {
      return;
    }
    let allowed = config.corsOrigins.includes(origin);
    if (!allowed) {
      try {
        allowed = new URL(origin).host === request.headers.host;
      } catch {
        allowed = false;
      }
    }
    if (!allowed) {
      return reply.code(403).send({
        error: {
          code: "ORIGIN_FORBIDDEN",
          message: "Cross-origin mutation is not allowed.",
          requestId: request.id,
        },
      });
    }
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: {
        code: "NOT_FOUND",
        message: `Route not found: ${request.method} ${request.url}`,
        requestId: request.id,
      },
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      app.log.warn({ reqId: request.id, issues: error.issues }, "request validation failed");
      return reply.code(400).send({
        error: {
          code: "VALIDATION_FAILED",
          message: "Request body or parameters did not match the API contract.",
          requestId: request.id,
          details: { issues: error.issues },
        },
      });
    }

    if (error instanceof CharacterCardParseError) {
      app.log.warn({ reqId: request.id }, "character card rejected");
      return reply.code(400).send({
        error: {
          code: "INVALID_CHARACTER_CARD",
          message: error.message,
          requestId: request.id,
        },
      });
    }

    if (error instanceof PromptBudgetExceededError) {
      return reply.code(422).send({
        error: {
          code: "PROMPT_BUDGET_EXCEEDED",
          message: error.message,
          requestId: request.id,
          details: {
            requiredTokens: error.requiredTokens,
            availableTokens: error.availableTokens,
          },
        },
      });
    }

    if (error instanceof AuthError) {
      app.log.warn({ reqId: request.id, code: error.code }, "auth request rejected");
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id,
        },
      });
    }

    if (error instanceof DomainError) {
      const status = STATUS_BY_CODE[error.code] ?? 409;
      app.log.warn({ reqId: request.id, code: error.code }, "domain request rejected");
      return reply.code(status).send({
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id,
          details: error.details,
        },
      });
    }

    const fastifyError = error as {
      statusCode?: number;
      name?: string;
      message?: string;
    };
    const statusCode = fastifyError.statusCode ?? 500;
    if (statusCode >= 500) {
      app.log.error(
        { reqId: request.id, errName: fastifyError.name, errMessage: fastifyError.message },
        "unhandled request failure",
      );
    }
    return reply.code(statusCode).send({
      error: {
        code: statusCode === 429 ? "RATE_LIMITED" : "REQUEST_FAILED",
        message:
          statusCode >= 500
            ? "Internal server error."
            : (fastifyError.message ?? "Request failed."),
        requestId: request.id,
      },
    });
  });

  // Register routes after the root error/not-found handlers so child plugin
  // contexts inherit them. Fastify captures the handler context at registration.
  await app.register(healthRoutes(config));
  await app.register(metaRoutes(config, database !== null), { prefix: "/api" });
  await app.register(demoRoutes(config, store), { prefix: "/api/demo" });

  if (database) {
    const auth = new AuthService(database.db, config);
    await app.register(authRoutes({ config, auth }), { prefix: "/api/auth" });
    await app.register(characterRoutes({ db: database.db, auth }), {
      prefix: "/api/characters",
    });
    await app.register(lorebookRoutes({ db: database.db, auth }), {
      prefix: "/api/lorebooks",
    });
    await app.register(conversationRoutes({ db: database.db, auth }), {
      prefix: "/api/conversations",
    });
    await app.register(syncRoutes({ db: database.db, auth }), { prefix: "/api/sync" });
    await app.register(mutationRoutes({ db: database.db, auth }), { prefix: "/api" });
    await app.register(promptRoutes({ db: database.db, auth }), {
      prefix: "/api/prompt",
    });
    await app.register(dataRoutes({ db: database.db, auth }), { prefix: "/api" });
    app.addHook("onClose", async () => {
      if (ownsDatabase) {
        await database.pool.end();
      }
    });
  }

  return app;
}
