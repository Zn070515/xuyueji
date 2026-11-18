import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { DomainError, type DomainErrorCode } from "@xuyueji/domain";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";

import type { AppConfig } from "./config.js";
import { createDemoStore } from "./demo-store.js";
import { demoRoutes } from "./routes/demo.js";
import { healthRoutes } from "./routes/health.js";
import { metaRoutes } from "./routes/meta.js";

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
    bodyLimit: 64 * 1024,
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
    trustProxy: config.trustProxy,
  });

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
  await app.register(metaRoutes(config), { prefix: "/api" });
  await app.register(demoRoutes(config, store), { prefix: "/api/demo" });

  return app;
}
