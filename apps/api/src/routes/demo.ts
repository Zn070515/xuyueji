import { confirmPaymentCallback } from "@xuyueji/billing";
import {
  createCharacterVersionRequestSchema,
  type DemoCharacterVersionResponse,
  type PaymentCallbackResponse,
  paymentCallbackRequestSchema,
} from "@xuyueji/contracts";
import { NotFoundError } from "@xuyueji/domain";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { AppConfig } from "../config.js";
import { applyDemoCharacterVersion, type DemoStore, nextDemoLedgerId } from "../demo-store.js";

const characterParamsSchema = z.object({
  characterId: z.string().min(1).max(100),
});

export function demoRoutes(config: AppConfig, store: DemoStore): FastifyPluginAsync {
  return async (app) => {
    app.get("/state", async () => ({
      demo: true as const,
      reason: "所有数据均为进程内演示状态，重启即清空；不是用户存档。",
      character: {
        id: store.character.character.id,
        name: store.character.character.versions.at(-1)?.payload.name ?? "",
        activeVersionId: store.character.character.activeVersionId,
        versionCount: store.character.character.versions.length,
      },
      wallet: {
        availablePoints: store.payment.wallet.availablePoints,
        reservedPoints: store.payment.wallet.reservedPoints,
        paymentsEnabled: false as const,
      },
      order: {
        merchantTradeNo: store.payment.order.merchantTradeNo,
        amountFen: store.payment.order.amountFen,
        points: store.payment.order.points,
        status: store.payment.order.status,
      },
      ledgerEntries: store.payment.ledger.length,
    }));

    app.post("/characters/:characterId/versions", async (request) => {
      const params = characterParamsSchema.parse(request.params);
      const body = createCharacterVersionRequestSchema.parse(request.body);

      if (params.characterId !== store.character.character.id) {
        throw new NotFoundError("Demo character not found.", {
          characterId: params.characterId,
        });
      }

      const response: DemoCharacterVersionResponse = applyDemoCharacterVersion(store, {
        characterId: params.characterId,
        requestId: body.requestId,
        expectedActiveVersionId: body.expectedActiveVersionId,
        payload: body.payload,
      });
      return response;
    });

    app.get("/payments/order", async () => ({
      demo: true as const,
      order: {
        merchantTradeNo: store.payment.order.merchantTradeNo,
        amountFen: store.payment.order.amountFen,
        points: store.payment.order.points,
        status: store.payment.order.status,
        providerTradeNo: store.payment.order.providerTradeNo,
      },
      wallet: {
        availablePoints: store.payment.wallet.availablePoints,
        reservedPoints: store.payment.wallet.reservedPoints,
      },
      ledgerEntries: store.payment.ledger.length,
      provider: store.payment.provider.name,
      note: "Mock 支付回调仅用于验证幂等不变量，不代表支付宝已开通。",
    }));

    app.post("/payments/callback", async (request) => {
      const body = paymentCallbackRequestSchema.parse(request.body);
      const result = confirmPaymentCallback({
        order: store.payment.order,
        wallet: store.payment.wallet,
        ledger: store.payment.ledger,
        notification: body.notification,
        provider: store.payment.provider,
        entryId: nextDemoLedgerId(store),
        now: new Date().toISOString(),
      });

      store.payment = {
        ...store.payment,
        order: result.order,
        wallet: result.wallet,
        ledger: result.ledger,
      };

      const response: PaymentCallbackResponse = {
        demo: true,
        credited: result.credited,
        orderStatus: result.order.status,
        availablePoints: result.wallet.availablePoints,
        ledgerEntries: result.ledger.length,
      };
      return response;
    });

    app.get("/wallet/summary", async () => ({
      demo: true as const,
      availablePoints: store.payment.wallet.availablePoints,
      reservedPoints: store.payment.wallet.reservedPoints,
      paymentsEnabled: config.paymentsEnabled,
      note: "余额由服务端决定；M0 未接入真实支付。",
    }));
  };
}
