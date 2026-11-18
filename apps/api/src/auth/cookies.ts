import type { FastifyReply } from "fastify";

import { SESSION_COOKIE } from "./session-token.js";

export interface CookieSettings {
  readonly secure: boolean;
}

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  expiresAt: string,
  settings: CookieSettings,
): void {
  const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: settings.secure,
    maxAge,
  });
}

export function clearSessionCookie(reply: FastifyReply, settings: CookieSettings): void {
  reply.clearCookie(SESSION_COOKIE, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: settings.secure,
  });
}
