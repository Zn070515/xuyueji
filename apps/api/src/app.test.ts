import { createMockPaymentProvider } from "@xuyueji/billing";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { type AppConfig, loadConfig } from "./config.js";

const mockSecret = "test-only-mock-secret";

function demoConfig(): AppConfig {
  return {
    ...loadConfig({ DEMO_MODE: "true" }),
    mockPaymentSecret: mockSecret,
    rateLimitMax: 1_000,
  };
}

async function makeApp() {
  return buildApp({ config: demoConfig(), logger: false });
}

afterEach(() => {
  // Each test creates and closes its own app; nothing global to reset.
});

describe("API shell", () => {
  it("reports health without exposing secrets", async () => {
    const app = await makeApp();
    try {
      const response = await app.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe("ok");
      expect(body.service).toBe("xuyueji-api");
      expect(body.mode).toBe("demo");
      expect(JSON.stringify(body)).not.toContain(mockSecret);
    } finally {
      await app.close();
    }
  });

  it("reports model and payment capability as disabled in M0", async () => {
    const app = await makeApp();
    try {
      const response = await app.inject({ method: "GET", url: "/api/meta" });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.demo).toBe(true);
      expect(body.paymentsEnabled).toBe(false);
      expect(body.aiEnabled).toBe(false);
      const billing = body.capabilities.find((item: { key: string }) => item.key === "billing");
      expect(billing.enabled).toBe(false);
    } finally {
      await app.close();
    }
  });
});

describe("demo character version CAS", () => {
  it("returns 409 for a stale editor and accepts the current version once", async () => {
    const app = await makeApp();
    try {
      const stale = await app.inject({
        method: "POST",
        url: "/api/demo/characters/character_demo/versions",
        payload: {
          requestId: "req_stale",
          expectedActiveVersionId: "character_version_unknown",
          payload: { name: "旧草稿", description: "不应生效" },
        },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().error.code).toBe("VERSION_CONFLICT");

      const accepted = await app.inject({
        method: "POST",
        url: "/api/demo/characters/character_demo/versions",
        payload: {
          requestId: "req_ok",
          expectedActiveVersionId: "character_version_demo_1",
          payload: { name: "星月书店店主", description: "第二版演示描述。" },
        },
      });
      expect(accepted.statusCode).toBe(200);
      expect(accepted.json().versionRevision).toBe(2);
      expect(accepted.json().activeVersionId).not.toBe("character_version_demo_1");

      const replayed = await app.inject({
        method: "POST",
        url: "/api/demo/characters/character_demo/versions",
        payload: {
          requestId: "req_ok",
          expectedActiveVersionId: "character_version_demo_1",
          payload: { name: "星月书店店主", description: "第二版演示描述。" },
        },
      });
      expect(replayed.statusCode).toBe(200);
      expect(replayed.json().activeVersionId).toBe(accepted.json().activeVersionId);

      const state = await app.inject({ method: "GET", url: "/api/demo/state" });
      expect(state.json().character.versionCount).toBe(2);
      expect(state.json().character.activeVersionId).toBe(accepted.json().activeVersionId);
    } finally {
      await app.close();
    }
  });

  it("rejects unknown fields at the request boundary", async () => {
    const app = await makeApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/demo/characters/character_demo/versions",
        payload: {
          requestId: "req_extra",
          expectedActiveVersionId: "character_version_demo_1",
          payload: { name: "星月书店店主", description: "x" },
          ownerUserId: "attacker-supplied-owner",
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_FAILED");
    } finally {
      await app.close();
    }
  });
});

describe("demo payment callback idempotency", () => {
  it("credits once across ten identical callbacks", async () => {
    const app = await makeApp();
    try {
      const provider = createMockPaymentProvider(mockSecret);
      const notification = provider.sign({
        merchantTradeNo: "XYJ20261118000001",
        providerTradeNo: "MOCK_TRADE_1",
        amountFen: 600,
        currency: "CNY",
        status: "TRADE_SUCCESS",
      });

      const results = [];
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const response = await app.inject({
          method: "POST",
          url: "/api/demo/payments/callback",
          payload: { notification },
        });
        expect(response.statusCode).toBe(200);
        results.push(response.json());
      }

      expect(results.filter((result) => result.credited)).toHaveLength(1);
      expect(results.at(-1)?.availablePoints).toBe(60);
      expect(results.at(-1)?.ledgerEntries).toBe(1);
      expect(results.at(-1)?.orderStatus).toBe("paid");

      const order = await app.inject({ method: "GET", url: "/api/demo/payments/order" });
      expect(order.json().ledgerEntries).toBe(1);
      expect(order.json().wallet.availablePoints).toBe(60);
    } finally {
      await app.close();
    }
  });

  it("rejects an invalid signature without crediting", async () => {
    const app = await makeApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/demo/payments/callback",
        payload: {
          notification: {
            merchantTradeNo: "XYJ20261118000001",
            providerTradeNo: "MOCK_TRADE_BAD",
            amountFen: 600,
            currency: "CNY",
            status: "TRADE_SUCCESS",
            signature: "f".repeat(64),
          },
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("PAYMENT_REJECTED");

      const summary = await app.inject({ method: "GET", url: "/api/demo/wallet/summary" });
      expect(summary.json().availablePoints).toBe(0);
    } finally {
      await app.close();
    }
  });
});

describe("API boundaries", () => {
  it("refuses to start without a production data path", async () => {
    await expect(
      buildApp({
        config: { ...demoConfig(), demoMode: false, mode: "production" },
        logger: false,
      }),
    ).rejects.toThrow(/only supports demo mode/i);
  });

  it("blocks cross-origin mutations but allows same/configured origins", async () => {
    const app = await makeApp();
    try {
      const evil = await app.inject({
        method: "POST",
        url: "/api/demo/payments/callback",
        headers: { origin: "https://evil.example" },
        payload: {},
      });
      expect(evil.statusCode).toBe(403);
      expect(evil.json().error.code).toBe("ORIGIN_FORBIDDEN");

      const configured = await app.inject({
        method: "POST",
        url: "/api/demo/payments/callback",
        headers: { origin: "http://127.0.0.1:5173" },
        payload: {},
      });
      expect(configured.statusCode).not.toBe(403);

      const read = await app.inject({
        method: "GET",
        url: "/health",
        headers: { origin: "https://evil.example" },
      });
      expect(read.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const app = await makeApp();
    try {
      const response = await app.inject({ method: "GET", url: "/api/does-not-exist" });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("NOT_FOUND");
    } finally {
      await app.close();
    }
  });
});
