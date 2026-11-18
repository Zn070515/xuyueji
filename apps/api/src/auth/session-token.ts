import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "xyj_session";

export interface SessionToken {
  readonly token: string;
  readonly hash: string;
}

export function createSessionToken(): SessionToken {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashSessionToken(token) };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
