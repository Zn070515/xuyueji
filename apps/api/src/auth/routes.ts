import {
  type AuthConfigResponse,
  type AuthSessionResponse,
  loginRequestSchema,
  registerRequestSchema,
} from "@xuyueji/contracts";
import type { FastifyPluginAsync } from "fastify";

import type { AppConfig } from "../config.js";
import { clearSessionCookie, setSessionCookie } from "./cookies.js";
import { requireAuth, requireSession } from "./guard.js";
import type { AuthService } from "./service.js";
import { SESSION_COOKIE } from "./session-token.js";

export interface AuthRoutesOptions {
  readonly config: AppConfig;
  readonly auth: AuthService;
}

export function authRoutes(options: AuthRoutesOptions): FastifyPluginAsync {
  const { config, auth } = options;
  const cookieSettings = { secure: config.cookieSecure };

  return async (app) => {
    app.get(
      "/config",
      async (): Promise<AuthConfigResponse> => ({
        signupEnabled: config.signupEnabled,
        sessionTtlDays: config.sessionTtlDays,
      }),
    );

    app.post(
      "/register",
      {
        config: {
          rateLimit: { max: config.signupRateLimitMax, timeWindow: "1 minute" },
        },
      },
      async (request, reply) => {
        const body = registerRequestSchema.parse(request.body);
        const result = await auth.register({
          email: body.email,
          password: body.password,
          displayName: body.displayName,
        });
        setSessionCookie(reply, result.token, result.expiresAt, cookieSettings);
        reply.code(201);
        const response: AuthSessionResponse = {
          user: result.user,
          expiresAt: result.expiresAt,
        };
        return response;
      },
    );

    app.post(
      "/login",
      {
        config: {
          rateLimit: { max: config.loginRateLimitMax, timeWindow: "1 minute" },
        },
      },
      async (request, reply) => {
        const body = loginRequestSchema.parse(request.body);
        const result = await auth.login({ email: body.email, password: body.password });
        setSessionCookie(reply, result.token, result.expiresAt, cookieSettings);
        const response: AuthSessionResponse = {
          user: result.user,
          expiresAt: result.expiresAt,
        };
        return response;
      },
    );

    app.post("/logout", async (request, reply) => {
      const token = request.cookies[SESSION_COOKIE];
      if (token) {
        await auth.logout(token);
      }
      clearSessionCookie(reply, cookieSettings);
      return reply.code(204).send();
    });

    app.post("/logout-all", { preHandler: requireAuth(auth) }, async (request, reply) => {
      const session = requireSession(request);
      await auth.revokeAllForUser(session.userId);
      clearSessionCookie(reply, cookieSettings);
      return reply.code(204).send();
    });

    app.get("/me", { preHandler: requireAuth(auth) }, async (request) => {
      const session = requireSession(request);
      const response: AuthSessionResponse = {
        user: session.user,
        expiresAt: session.expiresAt,
      };
      return response;
    });
  };
}
