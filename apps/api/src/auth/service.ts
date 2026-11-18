import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import type { AppConfig } from "../config.js";
import type { Database } from "../db/client.js";
import { authSessions, users } from "../db/schema.js";
import { toIso } from "../time.js";
import { AuthError } from "./errors.js";
import { hashPassword, verifyPassword } from "./password.js";
import { createSessionToken, hashSessionToken } from "./session-token.js";

export interface PublicUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly ageGateState: string;
  readonly createdAt: string;
}

export interface AuthResult {
  readonly user: PublicUser;
  readonly token: string;
  readonly expiresAt: string;
}

export interface SessionContext {
  readonly sessionId: string;
  readonly userId: string;
  readonly user: PublicUser;
  readonly expiresAt: string;
}

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toPublicUser(row: typeof users.$inferSelect): PublicUser {
  if (!row.emailNormalized) {
    throw new AuthError("UNAUTHENTICATED", "User has no login identity.");
  }
  return {
    id: row.id,
    email: row.emailNormalized,
    displayName: row.displayName ?? row.emailNormalized.split("@")[0] ?? "用户",
    ageGateState: row.ageGateState,
    createdAt: toIso(row.createdAt),
  };
}

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { constraint?: string } }).cause;
  return cause?.constraint === "users_email_normalized_uq";
}

export class AuthService {
  constructor(
    private readonly db: Database,
    private readonly config: AppConfig,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    if (!this.config.signupEnabled) {
      throw new AuthError(
        "SIGNUP_DISABLED",
        "Public signup is not open. An operator must create the account.",
      );
    }

    const email = normalizeEmail(input.email);
    const userId = randomUUID();
    const passwordHash = await hashPassword(input.password);

    try {
      const [row] = await this.db
        .insert(users)
        .values({
          id: userId,
          emailNormalized: email,
          passwordHash,
          displayName: input.displayName.trim(),
          ageGateState: "self_declared_adult",
        })
        .returning();
      if (!row) {
        throw new Error("User insert returned no row.");
      }
      return await this.issueSession(toPublicUser(row));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AuthError("EMAIL_TAKEN", "An account with this email already exists.");
      }
      throw error;
    }
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.emailNormalized, email))
      .limit(1);

    if (!row?.passwordHash) {
      // Keep a comparable scrypt cost for unknown emails to reduce account
      // enumeration through response timing.
      await hashPassword(input.password);
      throw new AuthError("INVALID_CREDENTIALS", "Email or password is incorrect.");
    }

    if (row.status !== "active") {
      throw new AuthError("ACCOUNT_DISABLED", "This account is not active.");
    }

    const valid = await verifyPassword(input.password, row.passwordHash);
    if (!valid) {
      throw new AuthError("INVALID_CREDENTIALS", "Email or password is incorrect.");
    }

    return this.issueSession(toPublicUser(row));
  }

  async resolveSession(token: string): Promise<SessionContext> {
    const hash = hashSessionToken(token);
    const [result] = await this.db
      .select({ session: authSessions, user: users })
      .from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(eq(authSessions.sessionHash, hash))
      .limit(1);

    if (!result) {
      throw new AuthError("UNAUTHENTICATED", "Session is missing or revoked.");
    }
    if (result.session.revokedAt !== null) {
      throw new AuthError("UNAUTHENTICATED", "Session is revoked.");
    }
    if (Date.parse(result.session.expiresAt) <= Date.now()) {
      throw new AuthError("SESSION_EXPIRED", "Session has expired.");
    }
    if (result.user.status !== "active") {
      throw new AuthError("ACCOUNT_DISABLED", "This account is not active.");
    }

    const now = new Date();
    const lastUsed = result.session.lastUsedAt ? Date.parse(result.session.lastUsedAt) : 0;
    if (now.getTime() - lastUsed > 5 * 60 * 1000) {
      await this.db
        .update(authSessions)
        .set({ lastUsedAt: now.toISOString() })
        .where(eq(authSessions.id, result.session.id));
    }

    return {
      sessionId: result.session.id,
      userId: result.user.id,
      user: toPublicUser(result.user),
      expiresAt: result.session.expiresAt,
    };
  }

  async logout(token: string): Promise<void> {
    const hash = hashSessionToken(token);
    await this.db
      .update(authSessions)
      .set({ revokedAt: new Date().toISOString() })
      .where(and(eq(authSessions.sessionHash, hash), isNull(authSessions.revokedAt)));
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(authSessions)
      .set({ revokedAt: new Date().toISOString() })
      .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
  }

  private async issueSession(user: PublicUser): Promise<AuthResult> {
    const { token, hash } = createSessionToken();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.sessionTtlDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    await this.db.insert(authSessions).values({
      id: randomUUID(),
      userId: user.id,
      sessionHash: hash,
      expiresAt,
      lastUsedAt: now.toISOString(),
    });

    return { user, token, expiresAt };
  }
}
