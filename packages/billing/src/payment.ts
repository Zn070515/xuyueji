import {
  InvariantViolationError,
  type LedgerEntryId,
  type PaymentOrderId,
  PaymentRejectedError,
  type UserId,
} from "@xuyueji/domain";

import { asAmountFen, assertPositive } from "./money.js";
import type { LedgerEntry, Wallet } from "./wallet.js";
import { creditTopup } from "./wallet.js";

export type PaymentOrderStatus =
  | "created"
  | "pending"
  | "paid"
  | "closed"
  | "expired"
  | "partially_refunded"
  | "refunded";

export interface PaymentOrder {
  readonly id: PaymentOrderId;
  readonly merchantTradeNo: string;
  readonly ownerId: UserId;
  readonly amountFen: number;
  readonly points: number;
  readonly currency: "CNY";
  readonly status: PaymentOrderStatus;
  readonly providerTradeNo: string | null;
  readonly paidAt: string | null;
  readonly createdAt: string;
}

export interface PaymentNotification {
  readonly merchantTradeNo: string;
  readonly providerTradeNo: string;
  readonly amountFen: number;
  readonly currency: "CNY";
  readonly status: "TRADE_SUCCESS" | "TRADE_CLOSED";
  readonly signature: string;
}

export interface PaymentProvider {
  readonly name: string;
  verifyNotification(notification: PaymentNotification): boolean;
}

export interface CreatePaymentOrderInput {
  readonly id: PaymentOrderId;
  readonly merchantTradeNo: string;
  readonly ownerId: UserId;
  readonly amountFen: number;
  readonly points: number;
  readonly createdAt: string;
}

export function createPaymentOrder(input: CreatePaymentOrderInput): PaymentOrder {
  assertPositive(input.amountFen, "Order amountFen");
  asAmountFen(input.amountFen);
  assertPositive(input.points, "Order points");
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(input.merchantTradeNo)) {
    throw new RangeError("merchantTradeNo must be 6-64 URL-safe characters.");
  }

  return {
    id: input.id,
    merchantTradeNo: input.merchantTradeNo,
    ownerId: input.ownerId,
    amountFen: input.amountFen,
    points: input.points,
    currency: "CNY",
    status: "created",
    providerTradeNo: null,
    paidAt: null,
    createdAt: input.createdAt,
  };
}

export interface ConfirmPaymentInput {
  readonly order: PaymentOrder;
  readonly wallet: Wallet;
  readonly ledger: readonly LedgerEntry[];
  readonly notification: PaymentNotification;
  readonly provider: PaymentProvider;
  readonly entryId: LedgerEntryId;
  readonly now: string;
}

export interface ConfirmPaymentResult {
  readonly credited: boolean;
  readonly order: PaymentOrder;
  readonly wallet: Wallet;
  readonly ledger: readonly LedgerEntry[];
}

/**
 * Idempotent payment confirmation.
 *
 * The same external notification may arrive many times, concurrently, or after
 * a process restart. The order status and the ledger `uniqueKey` are checked
 * before any credit is applied. The API layer must run this inside one short
 * database transaction with row locks; this pure function is the business
 * rule it commits.
 */
export function confirmPaymentCallback(input: ConfirmPaymentInput): ConfirmPaymentResult {
  const { order, notification, wallet, provider } = input;

  if (!provider.verifyNotification(notification)) {
    throw new PaymentRejectedError("Payment notification signature is invalid.", {
      provider: provider.name,
      merchantTradeNo: notification.merchantTradeNo,
    });
  }

  if (notification.merchantTradeNo !== order.merchantTradeNo) {
    throw new PaymentRejectedError("Payment notification does not match the order.", {
      expectedMerchantTradeNo: order.merchantTradeNo,
      receivedMerchantTradeNo: notification.merchantTradeNo,
    });
  }

  if (notification.amountFen !== order.amountFen) {
    throw new PaymentRejectedError("Payment amount does not match the order.", {
      expectedAmountFen: order.amountFen,
      receivedAmountFen: notification.amountFen,
    });
  }

  if (notification.currency !== order.currency) {
    throw new PaymentRejectedError("Payment currency does not match the order.", {
      expectedCurrency: order.currency,
      receivedCurrency: notification.currency,
    });
  }

  if (notification.status !== "TRADE_SUCCESS") {
    return { credited: false, order, wallet, ledger: input.ledger };
  }

  if (
    order.status === "paid" ||
    order.status === "partially_refunded" ||
    order.status === "refunded"
  ) {
    if (order.providerTradeNo !== null && order.providerTradeNo !== notification.providerTradeNo) {
      throw new PaymentRejectedError("Order was already paid by a different provider trade.", {
        orderProviderTradeNo: order.providerTradeNo,
        receivedProviderTradeNo: notification.providerTradeNo,
      });
    }
    return { credited: false, order, wallet, ledger: input.ledger };
  }

  if (order.status === "closed" || order.status === "expired") {
    throw new PaymentRejectedError("Payment arrived for a closed or expired order.", {
      status: order.status,
      merchantTradeNo: order.merchantTradeNo,
    });
  }

  if (wallet.ownerId !== order.ownerId) {
    throw new InvariantViolationError("Wallet and order belong to different users.", {
      walletOwnerId: wallet.ownerId,
      orderOwnerId: order.ownerId,
    });
  }

  const credited = creditTopup(wallet, input.ledger, {
    id: input.entryId,
    occurredAt: input.now,
    points: order.points,
    merchantTradeNo: order.merchantTradeNo,
  });

  const paidOrder: PaymentOrder = {
    ...order,
    status: "paid",
    providerTradeNo: notification.providerTradeNo,
    paidAt: input.now,
  };

  return {
    credited: credited.entry.id === input.entryId,
    order: paidOrder,
    wallet: credited.wallet,
    ledger: credited.ledger,
  };
}
