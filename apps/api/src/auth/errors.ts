export type AuthErrorCode =
  | "EMAIL_TAKEN"
  | "INVALID_CREDENTIALS"
  | "SIGNUP_DISABLED"
  | "UNAUTHENTICATED"
  | "SESSION_EXPIRED"
  | "ACCOUNT_DISABLED";

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly statusCode: number;

  constructor(code: AuthErrorCode, message: string, statusCode?: number) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.statusCode =
      statusCode ??
      (code === "EMAIL_TAKEN"
        ? 409
        : code === "SIGNUP_DISABLED"
          ? 403
          : code === "INVALID_CREDENTIALS" ||
              code === "UNAUTHENTICATED" ||
              code === "SESSION_EXPIRED" ||
              code === "ACCOUNT_DISABLED"
            ? 401
            : 400);
  }
}
