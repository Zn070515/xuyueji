import { asLedgerEntryId, asUserId, InsufficientPointsError } from "@xuyueji/domain";
import { describe, expect, it } from "vitest";

import {
  assertWalletInvariants,
  createWallet,
  creditTopup,
  type LedgerEntry,
  releaseReservation,
  reservePoints,
  settleReservation,
} from "./index.js";

const ownerId = asUserId("user_owner");
const now = "2026-11-18T10:00:00.000Z";

describe("wallet invariants", () => {
  it("reserves, settles and returns the unused remainder", () => {
    const initial = createWallet(ownerId);
    const topup = creditTopup(initial, [], {
      id: asLedgerEntryId("ledger_topup"),
      occurredAt: now,
      points: 100,
      merchantTradeNo: "XYJ_ORDER_1",
    });

    const reserved = reservePoints(topup.wallet, {
      id: asLedgerEntryId("ledger_reserve"),
      occurredAt: now,
      points: 30,
      runId: "run_1",
    });

    expect(reserved.wallet.availablePoints).toBe(70);
    expect(reserved.wallet.reservedPoints).toBe(30);

    const settled = settleReservation(reserved.wallet, topup.ledger, {
      id: asLedgerEntryId("ledger_settle"),
      occurredAt: now,
      reservedPoints: 30,
      actualCostPoints: 20,
      runId: "run_1",
    });

    expect(settled.wallet.availablePoints).toBe(80);
    expect(settled.wallet.reservedPoints).toBe(0);
    expect(settled.entry.deltaAvailable).toBe(10);
    expect(settled.entry.deltaReserved).toBe(-30);
  });

  it("releases a reservation without charging", () => {
    const initial = createWallet(ownerId);
    const topup = creditTopup(initial, [], {
      id: asLedgerEntryId("ledger_topup"),
      occurredAt: now,
      points: 50,
      merchantTradeNo: "XYJ_ORDER_2",
    });
    const reserved = reservePoints(topup.wallet, {
      id: asLedgerEntryId("ledger_reserve"),
      occurredAt: now,
      points: 50,
      runId: "run_2",
    });
    const released = releaseReservation(reserved.wallet, topup.ledger, {
      id: asLedgerEntryId("ledger_release"),
      occurredAt: now,
      points: 50,
      runId: "run_2",
    });

    expect(released.wallet.availablePoints).toBe(50);
    expect(released.wallet.reservedPoints).toBe(0);
  });

  it("refuses to reserve more than the available balance", () => {
    const wallet = createWallet(ownerId);
    expect(() =>
      reservePoints(wallet, {
        id: asLedgerEntryId("ledger_reserve"),
        occurredAt: now,
        points: 1,
        runId: "run_3",
      }),
    ).toThrow(InsufficientPointsError);
  });

  it("refuses actual cost above the frozen cap and below-zero balances", () => {
    const initial = createWallet(ownerId);
    const topup = creditTopup(initial, [], {
      id: asLedgerEntryId("ledger_topup"),
      occurredAt: now,
      points: 10,
      merchantTradeNo: "XYJ_ORDER_3",
    });
    const reserved = reservePoints(topup.wallet, {
      id: asLedgerEntryId("ledger_reserve"),
      occurredAt: now,
      points: 10,
      runId: "run_4",
    });

    expect(() =>
      settleReservation(reserved.wallet, topup.ledger, {
        id: asLedgerEntryId("ledger_settle"),
        occurredAt: now,
        reservedPoints: 10,
        actualCostPoints: 11,
        runId: "run_4",
      }),
    ).toThrow(/exceeds the frozen cap/i);

    expect(() => assertWalletInvariants({ ...reserved.wallet, availablePoints: -1 })).toThrow(
      /negative/i,
    );
  });

  it("uses the ledger unique key to make a top-up replay harmless", () => {
    const initial = createWallet(ownerId);
    const first = creditTopup(initial, [], {
      id: asLedgerEntryId("ledger_topup_1"),
      occurredAt: now,
      points: 25,
      merchantTradeNo: "XYJ_ORDER_4",
    });
    const replay = creditTopup(first.wallet, first.ledger, {
      id: asLedgerEntryId("ledger_topup_2"),
      occurredAt: now,
      points: 25,
      merchantTradeNo: "XYJ_ORDER_4",
    });

    expect(replay.wallet.availablePoints).toBe(25);
    expect(replay.ledger).toHaveLength(1);
    expect(replay.entry.id).toBe(asLedgerEntryId("ledger_topup_1"));
  });

  it("keeps ledger entries append-only in the returned value", () => {
    const initial = createWallet(ownerId);
    const first = creditTopup(initial, [], {
      id: asLedgerEntryId("ledger_topup_1"),
      occurredAt: now,
      points: 5,
      merchantTradeNo: "XYJ_ORDER_5",
    });
    const second = creditTopup(first.wallet, first.ledger, {
      id: asLedgerEntryId("ledger_topup_2"),
      occurredAt: now,
      points: 5,
      merchantTradeNo: "XYJ_ORDER_6",
    });
    const entries: readonly LedgerEntry[] = second.ledger;

    expect(entries).toHaveLength(2);
    expect(first.ledger).toHaveLength(1);
    expect(entries[0]?.kind).toBe("topup");
    expect(entries[1]?.kind).toBe("topup");
  });
});
