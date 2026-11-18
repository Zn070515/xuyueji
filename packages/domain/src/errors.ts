export type DomainErrorCode =
  | "VERSION_CONFLICT"
  | "INVARIANT_VIOLATION"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INSUFFICIENT_POINTS"
  | "INVALID_STATE_TRANSITION"
  | "PAYMENT_REJECTED";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(code: DomainErrorCode, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

export class VersionConflictError extends DomainError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super("VERSION_CONFLICT", message, details);
  }
}

export class InvariantViolationError extends DomainError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super("INVARIANT_VIOLATION", message, details);
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super("NOT_FOUND", message, details);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super("FORBIDDEN", message, details);
  }
}

export class InsufficientPointsError extends DomainError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super("INSUFFICIENT_POINTS", message, details);
  }
}

export class PaymentRejectedError extends DomainError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super("PAYMENT_REJECTED", message, details);
  }
}
