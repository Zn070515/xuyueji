import type { FastifyReply, FastifyRequest } from "fastify";

import { AuthError } from "./errors.js";
import type { AuthService, SessionContext } from "./service.js";
import { SESSION_COOKIE } from "./session-token.js";

/**
 * Resolves the server-side session on every protected request. The cookie only
 * carries an opaque token; authorization always comes from the database row.
 */
export function requireAuth(auth: AuthService) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) {
      throw new AuthError("UNAUTHENTICATED", "Sign-in is required.");
    }
    request.auth = await auth.resolveSession(token);
  };
}

export function requireSession(request: FastifyRequest): SessionContext {
  if (!request.auth) {
    throw new AuthError("UNAUTHENTICATED", "Sign-in is required.");
  }
  return request.auth;
}
