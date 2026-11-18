import {
  InsufficientPointsError,
  InvariantViolationError,
  type LedgerEntryId,
  type UserId,
} from "@xuyueji/domain";

import { assertInteger, assertPositive } from "./money.js";

export type LedgerKind = "topup" | "reserve" | "release" | "settlement" | "refund" | "adjustment";

/**
 * Integer points only. The wallet is server-authoritative; clients never send
 * balances or prices.
 */
export interface Wallet {
  readonly ownerId: UserId;
  readonly availablePoints: number;
  readonly reservedPoints: number;
  readonly version: number;
}

/**
 * Append-only ledger entry. `uniqueKey` is the idempotency boundary for
 * external events (a payment callback, a generation run settlement).
 */
export interface LedgerEntry {
  readonly id: LedgerEntryId;
  readonly ownerId: UserId;
  readonly kind: LedgerKind;
  readonly deltaAvailable: number;
  readonly deltaReserved: number;
  readonly refKind: string;
  readonly refId: string;
  readonly uniqueKey: string;
  readonly occurredAt: string;
}

export function createWallet(ownerId: UserId): Wallet {
  return {
    ownerId,
    availablePoints: 0,
    reservedPoints: 0,
    version: 0,
  };
}

export function assertWalletInvariants(wallet: Wallet): void {
  assertInteger(wallet.availablePoints, "availablePoints");
  assertInteger(wallet.reservedPoints, "reservedPoints");
  if (wallet.availablePoints < 0) {
    throw new InvariantViolationError("Wallet available points cannot be negative.", {
      availablePoints: wallet.availablePoints,
    });
  }
  if (wallet.reservedPoints < 0) {
    throw new InvariantViolationError("Wallet reserved points cannot be negative.", {
      reservedPoints: wallet.reservedPoints,
    });
  }
}

export function hasLedgerKey(entries: readonly LedgerEntry[], uniqueKey: string): boolean {
  return entries.some((entry) => entry.uniqueKey === uniqueKey);
}

function applyEntry(wallet: Wallet, entry: LedgerEntry): Wallet {
  const next: Wallet = {
    ...wallet,
    availablePoints: wallet.availablePoints + entry.deltaAvailable,
    reservedPoints: wallet.reservedPoints + entry.deltaReserved,
    version: wallet.version + 1,
  };
  assertWalletInvariants(next);
  return next;
}

export interface LedgerInput {
  readonly id: LedgerEntryId;
  readonly occurredAt: string;
}

export function creditTopup(
  wallet: Wallet,
  ledger: readonly LedgerEntry[],
  input: LedgerInput & {
    readonly points: number;
    readonly merchantTradeNo: string;
  },
): { wallet: Wallet; ledger: readonly LedgerEntry[]; entry: LedgerEntry } {
  assertPositive(input.points, "Top-up points");
  const uniqueKey = `topup:${input.merchantTradeNo}`;

  const existing = ledger.find((entry) => entry.uniqueKey === uniqueKey);
  if (existing) {
    return { wallet, ledger, entry: existing };
  }

  const entry: LedgerEntry = {
    id: input.id,
    ownerId: wallet.ownerId,
    kind: "topup",
    deltaAvailable: input.points,
    deltaReserved: 0,
    refKind: "payment_order",
    refId: input.merchantTradeNo,
    uniqueKey,
    occurredAt: input.occurredAt,
  };

  return {
    entry,
    wallet: applyEntry(wallet, entry),
    ledger: [...ledger, entry],
  };
}

export function reservePoints(
  wallet: Wallet,
  input: LedgerInput & { readonly points: number; readonly runId: string },
): { wallet: Wallet; entry: LedgerEntry } {
  assertPositive(input.points, "Reservation points");
  if (wallet.availablePoints < input.points) {
    throw new InsufficientPointsError("Not enough available points to reserve a generation.", {
      availablePoints: wallet.availablePoints,
      requestedPoints: input.points,
    });
  }

  const entry: LedgerEntry = {
    id: input.id,
    ownerId: wallet.ownerId,
    kind: "reserve",
    deltaAvailable: -input.points,
    deltaReserved: input.points,
    refKind: "generation_run",
    refId: input.runId,
    uniqueKey: `reserve:${input.runId}`,
    occurredAt: input.occurredAt,
  };

  return { wallet: applyEntry(wallet, entry), entry };
}

export function releaseReservation(
  wallet: Wallet,
  ledger: readonly LedgerEntry[],
  input: LedgerInput & { readonly points: number; readonly runId: string },
): { wallet: Wallet; ledger: readonly LedgerEntry[]; entry: LedgerEntry } {
  assertPositive(input.points, "Release points");
  if (wallet.reservedPoints < input.points) {
    throw new InvariantViolationError("Cannot release more points than are reserved.", {
      reservedPoints: wallet.reservedPoints,
      releasePoints: input.points,
    });
  }

  const uniqueKey = `release:${input.runId}`;
  const existing = ledger.find((entry) => entry.uniqueKey === uniqueKey);
  if (existing) {
    return { wallet, ledger, entry: existing };
  }

  const entry: LedgerEntry = {
    id: input.id,
    ownerId: wallet.ownerId,
    kind: "release",
    deltaAvailable: input.points,
    deltaReserved: -input.points,
    refKind: "generation_run",
    refId: input.runId,
    uniqueKey,
    occurredAt: input.occurredAt,
  };

  return {
    entry,
    wallet: applyEntry(wallet, entry),
    ledger: [...ledger, entry],
  };
}

/**
 * Settle a reservation. `actualCostPoints` must not exceed the frozen cap; a
 * provider-cost overrun is an operator reconciliation problem, never an
 * unauthorised overdraft.
 */
export function settleReservation(
  wallet: Wallet,
  ledger: readonly LedgerEntry[],
  input: LedgerInput & {
    readonly reservedPoints: number;
    readonly actualCostPoints: number;
    readonly runId: string;
  },
): { wallet: Wallet; ledger: readonly LedgerEntry[]; entry: LedgerEntry } {
  assertPositive(input.reservedPoints, "Reserved points");
  assertInteger(input.actualCostPoints, "Actual cost points");
  if (input.actualCostPoints < 0) {
    throw new RangeError("Actual cost points cannot be negative.");
  }
  if (input.actualCostPoints > input.reservedPoints) {
    throw new InvariantViolationError("Actual cost exceeds the frozen cap.", {
      reservedPoints: input.reservedPoints,
      actualCostPoints: input.actualCostPoints,
    });
  }
  if (wallet.reservedPoints < input.reservedPoints) {
    throw new InvariantViolationError("Cannot settle a reservation the wallet does not hold.", {
      reservedPoints: wallet.reservedPoints,
      settlePoints: input.reservedPoints,
    });
  }

  const uniqueKey = `settle:${input.runId}`;
  const existing = ledger.find((entry) => entry.uniqueKey === uniqueKey);
  if (existing) {
    return { wallet, ledger, entry: existing };
  }

  const refundToAvailable = input.reservedPoints - input.actualCostPoints;
  const entry: LedgerEntry = {
    id: input.id,
    ownerId: wallet.ownerId,
    kind: "settlement",
    deltaAvailable: refundToAvailable,
    deltaReserved: -input.reservedPoints,
    refKind: "generation_run",
    refId: input.runId,
    uniqueKey,
    occurredAt: input.occurredAt,
  };

  return {
    entry,
    wallet: applyEntry(wallet, entry),
    ledger: [...ledger, entry],
  };
}
