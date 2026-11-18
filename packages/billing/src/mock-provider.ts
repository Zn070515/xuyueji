import { createHmac, timingSafeEqual } from "node:crypto";

import type { PaymentNotification, PaymentProvider } from "./payment.js";

/**
 * Sandbox-only provider. It shows the shape of a signed callback without
 * pretending to be Alipay. `PAYMENT_MODE=mock` is the only permitted mode
 * until merchant onboarding is approved.
 */
export interface MockPaymentProvider extends PaymentProvider {
  sign(notification: Omit<PaymentNotification, "signature">): PaymentNotification;
}

function canonicalize(notification: Omit<PaymentNotification, "signature">): string {
  return [
    notification.merchantTradeNo,
    notification.providerTradeNo,
    String(notification.amountFen),
    notification.currency,
    notification.status,
  ].join("|");
}

export function createMockPaymentProvider(secret: string): MockPaymentProvider {
  if (secret.length < 8) {
    throw new Error("Mock payment secret must be at least 8 characters.");
  }

  const signatureFor = (notification: Omit<PaymentNotification, "signature">): string =>
    createHmac("sha256", secret).update(canonicalize(notification)).digest("hex");

  return {
    name: "mock-alipay",
    sign(notification) {
      return { ...notification, signature: signatureFor(notification) };
    },
    verifyNotification(notification) {
      const expected = signatureFor(notification);
      const received = notification.signature;
      if (expected.length !== received.length) {
        return false;
      }
      return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
    },
  };
}
