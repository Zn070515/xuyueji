import { asLedgerEntryId, asPaymentOrderId, asUserId, PaymentRejectedError } from "@xuyueji/domain";
import { describe, expect, it } from "vitest";

import {
  confirmPaymentCallback,
  createMockPaymentProvider,
  createPaymentOrder,
  createWallet,
  type LedgerEntry,
  type PaymentNotification,
  type Wallet,
} from "./index.js";

const ownerId = asUserId("user_owner");
const now = "2026-11-18T10:00:00.000Z";
const provider = createMockPaymentProvider("test-secret-not-a-real-key");

function setup() {
  const order = createPaymentOrder({
    id: asPaymentOrderId("order_1"),
    merchantTradeNo: "XYJ20261118000001",
    ownerId,
    amountFen: 600,
    points: 60,
    createdAt: now,
  });
  const wallet = createWallet(ownerId);
  const ledger: readonly LedgerEntry[] = [];
  const notification = provider.sign({
    merchantTradeNo: order.merchantTradeNo,
    providerTradeNo: "ALIPAY_MOCK_001",
    amountFen: 600,
    currency: "CNY",
    status: "TRADE_SUCCESS",
  });
  return { order, wallet, ledger, notification };
}

function confirm(
  state: {
    order: ReturnType<typeof setup>["order"];
    wallet: Wallet;
    ledger: readonly LedgerEntry[];
  },
  notification: PaymentNotification,
  suffix = "1",
) {
  return confirmPaymentCallback({
    ...state,
    notification,
    provider,
    entryId: asLedgerEntryId(`ledger_${suffix}`),
    now,
  });
}

describe("payment callback idempotency", () => {
  it("credits exactly once when the same successful callback arrives ten times", () => {
    const initial = setup();
    let state = { order: initial.order, wallet: initial.wallet, ledger: initial.ledger };
    let creditedCount = 0;

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const result = confirm(state, initial.notification, String(attempt));
      if (result.credited) {
        creditedCount += 1;
      }
      state = { order: result.order, wallet: result.wallet, ledger: result.ledger };
    }

    expect(creditedCount).toBe(1);
    expect(state.wallet.availablePoints).toBe(60);
    expect(state.wallet.reservedPoints).toBe(0);
    expect(state.ledger).toHaveLength(1);
    expect(state.ledger[0]?.uniqueKey).toBe("topup:XYJ20261118000001");
    expect(state.order.status).toBe("paid");
    expect(state.order.providerTradeNo).toBe("ALIPAY_MOCK_001");
  });

  it("treats an already-paid order as idempotent even if the ledger was reloaded", () => {
    const initial = setup();
    const first = confirm(initial, initial.notification, "1");
    const replayedWithFreshLedger = confirmPaymentCallback({
      order: first.order,
      wallet: first.wallet,
      ledger: [],
      notification: initial.notification,
      provider,
      entryId: asLedgerEntryId("ledger_replay"),
      now,
    });

    expect(replayedWithFreshLedger.credited).toBe(false);
    expect(replayedWithFreshLedger.wallet.availablePoints).toBe(60);
    expect(replayedWithFreshLedger.ledger).toHaveLength(0);
  });

  it("rejects an invalid signature without touching the wallet", () => {
    const initial = setup();
    const tampered: PaymentNotification = {
      ...initial.notification,
      signature: "0".repeat(64),
    };

    expect(() => confirm(initial, tampered)).toThrow(PaymentRejectedError);
    expect(initial.wallet.availablePoints).toBe(0);
    expect(initial.ledger).toHaveLength(0);
  });

  it("rejects an amount mismatch", () => {
    const initial = setup();
    const wrongAmount = provider.sign({
      merchantTradeNo: initial.order.merchantTradeNo,
      providerTradeNo: "ALIPAY_MOCK_002",
      amountFen: 1,
      currency: "CNY",
      status: "TRADE_SUCCESS",
    });

    expect(() => confirm(initial, wrongAmount)).toThrow(/amount/i);
    expect(initial.wallet.availablePoints).toBe(0);
  });

  it("rejects a second provider trade id after the order is paid", () => {
    const initial = setup();
    const first = confirm(initial, initial.notification, "1");
    const differentTrade = provider.sign({
      merchantTradeNo: initial.order.merchantTradeNo,
      providerTradeNo: "ALIPAY_MOCK_OTHER",
      amountFen: 600,
      currency: "CNY",
      status: "TRADE_SUCCESS",
    });

    expect(() =>
      confirm(
        { order: first.order, wallet: first.wallet, ledger: first.ledger },
        differentTrade,
        "2",
      ),
    ).toThrow(/different provider trade/i);
    expect(first.wallet.availablePoints).toBe(60);
  });

  it("rejects a payment for an expired order", () => {
    const initial = setup();
    const expired = { ...initial.order, status: "expired" as const };
    expect(() => confirm({ ...initial, order: expired }, initial.notification)).toThrow(
      /closed or expired/i,
    );
  });
});
