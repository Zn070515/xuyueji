import { z } from "zod";

/**
 * HTTP trust boundary. Every request body is parsed here before it reaches
 * domain code. Unknown fields are rejected so a client cannot smuggle
 * server-owned fields such as owner id, price, or safety level.
 */

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("xuyueji-api"),
  version: z.string(),
  mode: z.enum(["demo", "production"]),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const capabilitySchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  gate: z.string(),
  note: z.string(),
});
export type Capability = z.infer<typeof capabilitySchema>;

export const apiMetaSchema = z.object({
  product: z.literal("续月记 Xuyueji"),
  version: z.string(),
  demo: z.literal(true),
  paymentsEnabled: z.literal(false),
  aiEnabled: z.literal(false),
  reason: z.string(),
  capabilities: z.array(capabilitySchema),
  serverTime: z.string(),
});
export type ApiMeta = z.infer<typeof apiMetaSchema>;

export const characterPayloadSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(50_000),
    personality: z.string().max(20_000).optional(),
    scenario: z.string().max(20_000).optional(),
    firstMessage: z.string().max(20_000).optional(),
    alternateGreetings: z.array(z.string().max(20_000)).max(50).optional(),
    exampleMessages: z.array(z.string().max(20_000)).max(200).optional(),
    systemPrompt: z.string().max(20_000).optional(),
    postHistoryInstructions: z.string().max(20_000).optional(),
    tags: z.array(z.string().max(100)).max(50).optional(),
    creatorNotes: z.string().max(20_000).optional(),
    extensions: z.record(z.string(), z.unknown()).optional(),
    avatarAssetId: z.string().max(200).optional(),
  })
  .strict();
export type CharacterPayloadDto = z.infer<typeof characterPayloadSchema>;

export const createCharacterVersionRequestSchema = z
  .object({
    requestId: z.string().min(1).max(100),
    expectedActiveVersionId: z.string().min(1).max(100),
    payload: characterPayloadSchema,
  })
  .strict();
export type CreateCharacterVersionRequest = z.infer<typeof createCharacterVersionRequestSchema>;

export const characterVersionResponseSchema = z.object({
  demo: z.literal(true),
  characterId: z.string(),
  activeVersionId: z.string(),
  versionRevision: z.number().int().positive(),
  versionCount: z.number().int().positive(),
});
export type CharacterVersionResponse = z.infer<typeof characterVersionResponseSchema>;

export const paymentNotificationSchema = z
  .object({
    merchantTradeNo: z.string().min(6).max(64),
    providerTradeNo: z.string().min(1).max(128),
    amountFen: z.number().int().positive(),
    currency: z.literal("CNY"),
    status: z.enum(["TRADE_SUCCESS", "TRADE_CLOSED"]),
    signature: z.string().min(1).max(256),
  })
  .strict();
export type PaymentNotificationDto = z.infer<typeof paymentNotificationSchema>;

export const paymentCallbackRequestSchema = z
  .object({
    notification: paymentNotificationSchema,
  })
  .strict();
export type PaymentCallbackRequest = z.infer<typeof paymentCallbackRequestSchema>;

export const paymentCallbackResponseSchema = z.object({
  demo: z.literal(true),
  credited: z.boolean(),
  orderStatus: z.enum([
    "created",
    "pending",
    "paid",
    "closed",
    "expired",
    "partially_refunded",
    "refunded",
  ]),
  availablePoints: z.number().int().nonnegative(),
  ledgerEntries: z.number().int().nonnegative(),
});
export type PaymentCallbackResponse = z.infer<typeof paymentCallbackResponseSchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
