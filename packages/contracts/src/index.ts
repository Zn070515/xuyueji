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

export const demoCharacterVersionResponseSchema = z.object({
  demo: z.literal(true),
  characterId: z.string(),
  activeVersionId: z.string(),
  versionRevision: z.number().int().positive(),
  versionCount: z.number().int().positive(),
});
export type DemoCharacterVersionResponse = z.infer<typeof demoCharacterVersionResponseSchema>;

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

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  ageGateState: z.string(),
  createdAt: z.string(),
});
export type AuthUserDto = z.infer<typeof authUserSchema>;

export const registerRequestSchema = z
  .object({
    email: z.email().max(200),
    password: z.string().min(12).max(200),
    displayName: z.string().min(1).max(80),
    ageConfirmed: z.literal(true),
  })
  .strict();
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z
  .object({
    email: z.email().max(200),
    password: z.string().min(1).max(200),
  })
  .strict();
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authSessionResponseSchema = z.object({
  user: authUserSchema,
  expiresAt: z.string(),
});
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

export const authConfigResponseSchema = z.object({
  signupEnabled: z.boolean(),
  sessionTtlDays: z.number().int().positive(),
});
export type AuthConfigResponse = z.infer<typeof authConfigResponseSchema>;

export const sourceFormatSchema = z.enum(["native", "v2", "v3"]);
export type SourceFormat = z.infer<typeof sourceFormatSchema>;

export const createCharacterRequestSchema = z
  .object({
    payload: characterPayloadSchema,
    sourceFormat: sourceFormatSchema.optional(),
  })
  .strict();
export type CreateCharacterRequest = z.infer<typeof createCharacterRequestSchema>;

export const addCharacterVersionRequestSchema = z
  .object({
    expectedActiveVersionId: z.string().min(1).max(100),
    payload: characterPayloadSchema,
    sourceFormat: sourceFormatSchema.optional(),
  })
  .strict();
export type AddCharacterVersionRequest = z.infer<typeof addCharacterVersionRequestSchema>;

export const characterSummarySchema = z.object({
  id: z.string(),
  activeVersionId: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  name: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type CharacterSummaryDto = z.infer<typeof characterSummarySchema>;

export const characterVersionDtoSchema = z.object({
  id: z.string(),
  revision: z.number().int().positive(),
  sourceFormat: sourceFormatSchema,
  createdAt: z.string(),
  payload: characterPayloadSchema,
});
export type CharacterVersionDto = z.infer<typeof characterVersionDtoSchema>;

export const characterDetailSchema = z.object({
  character: characterSummarySchema,
  versions: z.array(characterVersionDtoSchema),
});
export type CharacterDetail = z.infer<typeof characterDetailSchema>;

export const characterVersionResponseSchema = z.object({
  characterId: z.string(),
  activeVersionId: z.string(),
  revision: z.number().int().positive(),
  versionCount: z.number().int().positive(),
});
export type CharacterVersionResponse = z.infer<typeof characterVersionResponseSchema>;

export const importCharacterCardRequestSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("json"),
      card: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z
    .object({
      kind: z.literal("png-base64"),
      base64: z.string().min(1).max(20_000_000),
    })
    .strict(),
]);
export type ImportCharacterCardRequest = z.infer<typeof importCharacterCardRequestSchema>;

export const characterCardImportReportSchema = z.object({
  format: sourceFormatSchema,
  specVersion: z.string(),
  warnings: z.array(z.string()),
  unknownTopLevelFields: z.number().int().nonnegative(),
  unknownDataFields: z.number().int().nonnegative(),
});
export type CharacterCardImportReport = z.infer<typeof characterCardImportReportSchema>;

export const characterCardImportResponseSchema = z.object({
  character: characterDetailSchema,
  report: characterCardImportReportSchema,
});
export type CharacterCardImportResponse = z.infer<typeof characterCardImportResponseSchema>;

export const characterExportFormatSchema = z.enum(["v2", "v3"]);
export type CharacterExportFormat = z.infer<typeof characterExportFormatSchema>;

export const actorRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), id: z.string().min(1).max(100) }).strict(),
  z.object({ kind: z.literal("persona"), id: z.string().min(1).max(100) }).strict(),
  z
    .object({
      kind: z.literal("character"),
      id: z.string().min(1).max(100),
      versionId: z.string().min(1).max(100),
    })
    .strict(),
  z.object({ kind: z.literal("system"), id: z.literal("platform") }).strict(),
]);
export type ActorRefDto = z.infer<typeof actorRefSchema>;

export const messageRoleSchema = z.enum(["system", "user", "assistant"]);

export const messageDtoSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  responseGroupId: z.string(),
  role: messageRoleSchema,
  actorRef: actorRefSchema,
  content: z.string(),
  originRunId: z.string().nullable(),
  tombstoneAt: z.string().nullable(),
  createdAt: z.string(),
});
export type MessageDto = z.infer<typeof messageDtoSchema>;

export const branchDtoSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  headMessageId: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  label: z.string(),
  createdAt: z.string(),
});
export type BranchDto = z.infer<typeof branchDtoSchema>;

export const conversationSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  mode: z.enum(["solo", "group"]),
  activeBranchId: z.string().nullable(),
  branchRevision: z.number().int().nonnegative(),
  headMessageId: z.string().nullable(),
  updatedAt: z.string(),
  createdAt: z.string(),
});
export type ConversationSummaryDto = z.infer<typeof conversationSummarySchema>;

export const conversationDetailSchema = z.object({
  conversation: conversationSummarySchema,
  branches: z.array(branchDtoSchema),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const createConversationRequestSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    mode: z.enum(["solo", "group"]).optional(),
  })
  .strict();
export type CreateConversationRequest = z.infer<typeof createConversationRequestSchema>;

export const appendMessageRequestSchema = z
  .object({
    branchId: z.string().min(1).max(100),
    expectedBranchRevision: z.number().int().nonnegative(),
    parentId: z.string().min(1).max(100).nullable(),
    // Normal chat writes are always user messages. Internal system messages
    // must come from a protected server-side path, never the public client.
    role: z.literal("user"),
    content: z.string().min(1).max(100_000),
    responseGroupId: z.string().min(1).max(100).optional(),
    requestId: z.string().min(1).max(100),
  })
  .strict();
export type AppendMessageRequest = z.infer<typeof appendMessageRequestSchema>;

export const appendCandidateRequestSchema = z
  .object({
    branchId: z.string().min(1).max(100),
    expectedBranchRevision: z.number().int().nonnegative(),
    parentMessageId: z.string().min(1).max(100),
    responseGroupId: z.string().min(1).max(100).optional(),
    actorRef: actorRefSchema,
    content: z.string().min(1).max(100_000),
    requestId: z.string().min(1).max(100),
  })
  .strict();
export type AppendCandidateRequest = z.infer<typeof appendCandidateRequestSchema>;

export const selectCandidateRequestSchema = z
  .object({
    branchId: z.string().min(1).max(100),
    expectedBranchRevision: z.number().int().nonnegative(),
    messageId: z.string().min(1).max(100),
  })
  .strict();
export type SelectCandidateRequest = z.infer<typeof selectCandidateRequestSchema>;

export const editMessageRequestSchema = z
  .object({
    branchId: z.string().min(1).max(100),
    expectedBranchRevision: z.number().int().nonnegative(),
    content: z.string().min(1).max(100_000),
    label: z.string().min(1).max(120).optional(),
  })
  .strict();
export type EditMessageRequest = z.infer<typeof editMessageRequestSchema>;

export const messagePageSchema = z.object({
  messages: z.array(messageDtoSchema),
  hasMore: z.boolean(),
  nextBefore: z.string().nullable(),
});
export type MessagePageDto = z.infer<typeof messagePageSchema>;

export const appendMessageResponseSchema = z.object({
  message: messageDtoSchema,
  branch: branchDtoSchema,
});
export type AppendMessageResponse = z.infer<typeof appendMessageResponseSchema>;

export const syncEntityTypeSchema = z.enum([
  "character",
  "persona",
  "lorebook",
  "lore_entry",
  "preset",
  "regex_rule",
  "memory_item",
  "conversation",
  "message",
  "branch",
]);

export const syncChangeSchema = z.object({
  sequence: z.number().int().positive(),
  entityType: syncEntityTypeSchema,
  entityId: z.string(),
  revision: z.number().int().nonnegative(),
  op: z.enum(["upsert", "delete"]),
  changedAt: z.string(),
});
export type SyncChangeDto = z.infer<typeof syncChangeSchema>;

export const syncPullResponseSchema = z.object({
  changes: z.array(syncChangeSchema),
  nextCursor: z.string(),
  hasMore: z.boolean(),
  serverTime: z.string(),
  resyncRequired: z.boolean(),
});
export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>;

export const syncMutationEnvelopeSchema = z
  .object({
    mutations: z
      .array(
        z
          .object({
            opId: z.string().min(1).max(100),
            entityType: z.enum(["persona", "lorebook", "preset", "regex_rule", "memory_item"]),
            entityId: z.uuid(),
            expectedRevision: z.number().int().positive().nullable(),
            action: z.enum(["upsert", "delete"]),
            payload: z.unknown(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export type SyncMutationEnvelope = z.infer<typeof syncMutationEnvelopeSchema>;

export const syncMutationResultSchema = z.object({
  opId: z.string(),
  status: z.enum(["accepted", "conflict", "rejected"]),
  newRevision: z.number().int().positive().optional(),
  code: z.string().optional(),
  message: z.string().optional(),
});
export type SyncMutationResult = z.infer<typeof syncMutationResultSchema>;

export const syncMutationResponseSchema = z.object({
  results: z.array(syncMutationResultSchema),
});
export type SyncMutationResponse = z.infer<typeof syncMutationResponseSchema>;

export const personaPayloadSchema = z
  .object({
    displayName: z.string().min(1).max(120),
    description: z.string().max(50_000),
  })
  .strict();
export type PersonaPayloadDto = z.infer<typeof personaPayloadSchema>;

export const personaSummarySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  activeVersionId: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string(),
});
export type PersonaSummaryDto = z.infer<typeof personaSummarySchema>;

export const personaVersionMetaSchema = z.object({
  id: z.string(),
  revision: z.number().int().positive(),
  createdAt: z.string(),
});

export const personaDetailSchema = z.object({
  persona: personaSummarySchema,
  activeVersion: z
    .object({
      id: z.string(),
      revision: z.number().int().positive(),
      payload: personaPayloadSchema,
      createdAt: z.string(),
    })
    .nullable(),
  versions: z.array(personaVersionMetaSchema),
});
export type PersonaDetailDto = z.infer<typeof personaDetailSchema>;

export const createPersonaRequestSchema = personaPayloadSchema;
export type CreatePersonaRequest = z.infer<typeof createPersonaRequestSchema>;

export const addPersonaVersionRequestSchema = z
  .object({
    expectedActiveVersionId: z.string().min(1).max(100),
    payload: personaPayloadSchema,
  })
  .strict();
export type AddPersonaVersionRequest = z.infer<typeof addPersonaVersionRequestSchema>;

export const personaVersionResponseSchema = z.object({
  personaId: z.string(),
  activeVersionId: z.string(),
  revision: z.number().int().positive(),
  versionCount: z.number().int().positive(),
});
export type PersonaVersionResponse = z.infer<typeof personaVersionResponseSchema>;

export const lorePositionSchema = z.enum([
  "before_char",
  "after_char",
  "before_examples",
  "after_examples",
  "at_depth",
]);

export const lorebookRuleDtoSchema = z.object({
  keys: z.array(z.string()),
  secondaryKeys: z.array(z.string()),
  caseSensitive: z.boolean(),
  constant: z.boolean(),
  probability: z.number().min(0).max(1),
  position: lorePositionSchema,
  scanDepth: z.number().int().nonnegative(),
  recursive: z.boolean(),
});

export const lorebookEntryDtoSchema = z.object({
  id: z.string(),
  lorebookId: z.string(),
  entryKey: z.string(),
  revision: z.number().int().positive(),
  content: z.string(),
  enabled: z.boolean(),
  sortKey: z.number().int().nonnegative(),
  rule: lorebookRuleDtoSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LorebookEntryDto = z.infer<typeof lorebookEntryDtoSchema>;

export const lorebookSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  revision: z.number().int().positive(),
  entryCount: z.number().int().nonnegative(),
  updatedAt: z.string(),
});
export type LorebookSummaryDto = z.infer<typeof lorebookSummarySchema>;

export const lorebookDetailSchema = z.object({
  lorebook: lorebookSummarySchema,
  entries: z.array(lorebookEntryDtoSchema),
});
export type LorebookDetailDto = z.infer<typeof lorebookDetailSchema>;

export const createLorebookRequestSchema = z.object({ title: z.string().min(1).max(120) }).strict();
export type CreateLorebookRequest = z.infer<typeof createLorebookRequestSchema>;

export const updateLorebookRequestSchema = z
  .object({
    title: z.string().min(1).max(120),
    expectedRevision: z.number().int().positive(),
  })
  .strict();
export type UpdateLorebookRequest = z.infer<typeof updateLorebookRequestSchema>;

export const lorebookEntryInputSchema = z
  .object({
    entryKey: z.string().min(1).max(120).optional(),
    content: z.string().min(1).max(100_000),
    keys: z.array(z.string().min(1).max(200)).max(100).default([]),
    secondaryKeys: z.array(z.string().min(1).max(200)).max(100).default([]),
    caseSensitive: z.boolean().default(false),
    constant: z.boolean().default(false),
    probability: z.number().min(0).max(1).default(1),
    position: lorePositionSchema.default("after_char"),
    scanDepth: z.number().int().min(0).max(50).default(4),
    recursive: z.boolean().default(false),
    enabled: z.boolean().default(true),
    sortKey: z.number().int().nonnegative().default(0),
  })
  .strict();
export type LorebookEntryInput = z.infer<typeof lorebookEntryInputSchema>;

export const updateLorebookEntryRequestSchema = lorebookEntryInputSchema
  .extend({ expectedRevision: z.number().int().positive() })
  .strict();
export type UpdateLorebookEntryRequest = z.infer<typeof updateLorebookEntryRequestSchema>;

export const promptComponentDtoSchema = z.object({
  kind: z.enum([
    "platform_policy",
    "preset_system",
    "character",
    "persona",
    "world_info",
    "memory",
    "examples",
    "history",
    "author_note",
    "user_input",
    "closing_constraints",
  ]),
  sourceId: z.string(),
  content: z.string(),
  estimatedTokens: z.number().int().nonnegative(),
  mandatory: z.boolean(),
  priority: z.number(),
  included: z.boolean(),
  reason: z.string().optional(),
});

export const promptHistoryMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export const promptPlanDtoSchema = z.object({
  digest: z.string(),
  components: z.array(promptComponentDtoSchema),
  estimatedInputTokens: z.number().int().nonnegative(),
  reservedOutputTokens: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
  systemPrompt: z.string(),
  messages: z.array(promptHistoryMessageSchema),
});
export type PromptPlanDto = z.infer<typeof promptPlanDtoSchema>;

export const promptPreviewRequestSchema = z
  .object({
    conversationId: z.uuid(),
    branchId: z.string().min(1).max(100),
    characterId: z.uuid(),
    userInput: z.string().min(1).max(100_000),
    lorebookIds: z.array(z.uuid()).max(20).optional(),
    personaId: z.uuid().optional(),
    persona: z
      .object({
        name: z.string().min(1).max(120),
        description: z.string().max(50_000),
      })
      .strict()
      .optional(),
    maxOutputTokens: z.number().int().min(1).max(4000).optional(),
    contextWindowTokens: z.number().int().min(1024).max(128_000).optional(),
    seed: z.number().int().optional(),
  })
  .strict();
export type PromptPreviewRequest = z.infer<typeof promptPreviewRequestSchema>;

export const worldInfoActivationDtoSchema = z.object({
  id: z.string(),
  reason: z.enum(["constant", "keyword", "recursive"]),
  depth: z.number().int().nonnegative(),
  matchedKeys: z.array(z.string()),
  content: z.string(),
  estimatedTokens: z.number().int().nonnegative(),
});

export const worldInfoSkipDtoSchema = z.object({
  entryId: z.string(),
  reason: z.string(),
});

export const promptPreviewResponseSchema = z.object({
  plan: promptPlanDtoSchema,
  worldInfo: z.object({
    activated: z.array(worldInfoActivationDtoSchema),
    skipped: z.array(worldInfoSkipDtoSchema),
    warnings: z.array(z.string()),
    totalEstimatedTokens: z.number().int().nonnegative(),
    totalBytes: z.number().int().nonnegative(),
  }),
});
export type PromptPreviewResponse = z.infer<typeof promptPreviewResponseSchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
