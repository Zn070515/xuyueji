import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * M0 schema baseline. It is intentionally a subset of DATA_MODEL.md: the
 * tables that already have domain invariants and tests. Later gates add
 * personas, lorebooks, presets, regex rules, memory, refunds and admin tables.
 *
 * All ids are application-generated UUID/ULID strings. The database enforces
 * the financial and idempotency boundaries that must survive client retries.
 */

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    status: text("status").notNull().default("active"),
    ageGateState: text("age_gate_state").notNull().default("unknown"),
    // Nullable for legacy rows; all newly created users must set both fields.
    emailNormalized: text("email_normalized"),
    passwordHash: text("password_hash"),
    displayName: text("display_name"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_email_normalized_uq").on(table.emailNormalized)],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionHash: text("session_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "string" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("auth_sessions_hash_uq").on(table.sessionHash),
    index("auth_sessions_user_idx").on(table.userId),
  ],
);

export const characters = pgTable(
  "characters",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // No FK: character_versions points back to characters and the pointer is
    // updated in the same transaction as the version insert.
    activeVersionId: uuid("active_version_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("characters_owner_idx").on(table.ownerUserId)],
);

export const characterVersions = pgTable(
  "character_versions",
  {
    id: uuid("id").primaryKey(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    sourceFormat: text("source_format").notNull().default("native"),
    payloadJsonb: jsonb("payload_jsonb").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("character_versions_revision_uq").on(table.characterId, table.revision),
    index("character_versions_owner_idx").on(table.ownerUserId),
    check("character_versions_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("未命名会话"),
    mode: text("mode").notNull().default("solo"),
    activeBranchId: uuid("active_branch_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "string" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("conversations_owner_updated_idx").on(table.ownerUserId, table.updatedAt),
    check("conversations_mode_valid", sql`${table.mode} in ('solo', 'group')`),
  ],
);

export const messageNodes = pgTable(
  "message_nodes",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    // No self FK: message graphs are validated by the domain layer and need
    // efficient bulk import. parent_id still forms the immutable ancestry.
    parentId: uuid("parent_id"),
    responseGroupId: uuid("response_group_id").notNull(),
    role: text("role").notNull(),
    actorRef: jsonb("actor_ref").$type<Record<string, unknown>>().notNull(),
    content: text("content").notNull(),
    originRunId: uuid("origin_run_id"),
    clientRequestId: text("client_request_id"),
    tombstoneAt: timestamp("tombstone_at", { withTimezone: true, mode: "string" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("message_nodes_client_request_uq")
      .on(table.ownerUserId, table.clientRequestId)
      .where(sql`${table.clientRequestId} is not null`),
    index("message_nodes_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
      table.id,
    ),
    index("message_nodes_response_group_idx").on(table.conversationId, table.responseGroupId),
    index("message_nodes_owner_idx").on(table.ownerUserId),
    check("message_nodes_role_valid", sql`${table.role} in ('system', 'user', 'assistant')`),
  ],
);

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    headMessageId: uuid("head_message_id"),
    revision: integer("revision").notNull().default(0),
    label: text("label").notNull().default("主线"),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    createdAt: createdAt(),
  },
  (table) => [
    index("branches_conversation_idx").on(table.conversationId),
    check("branches_revision_nonnegative", sql`${table.revision} >= 0`),
  ],
);

export const generationRuns = pgTable(
  "generation_runs",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    snapshotDigest: text("snapshot_digest").notNull(),
    modelId: text("model_id").notNull(),
    tariffVersion: text("tariff_version").notNull(),
    state: text("state").notNull(),
    clientRequestId: text("client_request_id").notNull(),
    capPoints: integer("cap_points").notNull(),
    costPoints: integer("cost_points"),
    usageJsonb: jsonb("usage_jsonb").$type<Record<string, unknown>>(),
    errorCode: text("error_code"),
    createdAt: createdAt(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    uniqueIndex("generation_runs_client_request_uq").on(table.ownerUserId, table.clientRequestId),
    index("generation_runs_owner_created_idx").on(table.ownerUserId, table.createdAt),
    check("generation_runs_cap_nonnegative", sql`${table.capPoints} >= 0`),
    check(
      "generation_runs_cost_nonnegative",
      sql`${table.costPoints} is null or ${table.costPoints} >= 0`,
    ),
    check(
      "generation_runs_cost_within_cap",
      sql`${table.costPoints} is null or ${table.costPoints} <= ${table.capPoints}`,
    ),
  ],
);

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "restrict" }),
    availablePoints: integer("available_points").notNull().default(0),
    reservedPoints: integer("reserved_points").notNull().default(0),
    version: integer("version").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("wallets_available_nonnegative", sql`${table.availablePoints} >= 0`),
    check("wallets_reserved_nonnegative", sql`${table.reservedPoints} >= 0`),
    check("wallets_version_nonnegative", sql`${table.version} >= 0`),
  ],
);

export const walletLedger = pgTable(
  "wallet_ledger",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    deltaAvailable: integer("delta_available").notNull(),
    deltaReserved: integer("delta_reserved").notNull(),
    refKind: text("ref_kind").notNull(),
    refId: text("ref_id").notNull(),
    uniqueKey: text("unique_key").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("wallet_ledger_unique_key_uq").on(table.uniqueKey),
    index("wallet_ledger_owner_occurred_idx").on(table.ownerUserId, table.occurredAt),
    check(
      "wallet_ledger_kind_valid",
      sql`${table.kind} in ('topup', 'reserve', 'release', 'settlement', 'refund', 'adjustment')`,
    ),
  ],
);

export const paymentOrders = pgTable(
  "payment_orders",
  {
    id: uuid("id").primaryKey(),
    merchantTradeNo: text("merchant_trade_no").notNull(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amountFen: integer("amount_fen").notNull(),
    points: integer("points").notNull(),
    currency: text("currency").notNull().default("CNY"),
    status: text("status").notNull().default("created"),
    providerTradeNo: text("provider_trade_no"),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "string" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("payment_orders_merchant_trade_uq").on(table.merchantTradeNo),
    index("payment_orders_owner_created_idx").on(table.ownerUserId, table.createdAt),
    check("payment_orders_amount_positive", sql`${table.amountFen} > 0`),
    check("payment_orders_points_positive", sql`${table.points} > 0`),
    check(
      "payment_orders_status_valid",
      sql`${table.status} in ('created', 'pending', 'paid', 'closed', 'expired', 'partially_refunded', 'refunded')`,
    ),
  ],
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey(),
    providerTradeNo: text("provider_trade_no").notNull(),
    merchantTradeNo: text("merchant_trade_no").notNull(),
    payloadSha256: text("payload_sha256").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    uniqueIndex("payment_events_provider_trade_uq").on(table.providerTradeNo),
    index("payment_events_merchant_trade_idx").on(table.merchantTradeNo),
  ],
);

export const tariffs = pgTable(
  "tariffs",
  {
    id: uuid("id").primaryKey(),
    version: text("version").notNull(),
    modelId: text("model_id").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true, mode: "string" }).notNull(),
    inputRate: numeric("input_rate", { precision: 18, scale: 8 }).notNull(),
    cachedInputRate: numeric("cached_input_rate", { precision: 18, scale: 8 }).notNull(),
    outputRate: numeric("output_rate", { precision: 18, scale: 8 }).notNull(),
    margin: numeric("margin", { precision: 8, scale: 4 }).notNull(),
    currency: text("currency").notNull().default("CNY"),
    roundingRule: text("rounding_rule").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("tariffs_version_uq").on(table.version),
    index("tariffs_model_effective_idx").on(table.modelId, table.effectiveFrom),
  ],
);

export const syncChanges = pgTable(
  "sync_changes",
  {
    sequence: bigserial("sequence", { mode: "number" }).primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    revision: integer("revision").notNull(),
    op: text("op").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sync_changes_owner_sequence_idx").on(table.ownerUserId, table.sequence),
    check("sync_changes_op_valid", sql`${table.op} in ('upsert', 'delete')`),
  ],
);

export const personas = pgTable(
  "personas",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeVersionId: uuid("active_version_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("personas_owner_idx").on(table.ownerUserId)],
);

export const personaVersions = pgTable(
  "persona_versions",
  {
    id: uuid("id").primaryKey(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    payloadJsonb: jsonb("payload_jsonb").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("persona_versions_revision_uq").on(table.personaId, table.revision),
    index("persona_versions_owner_idx").on(table.ownerUserId),
    check("persona_versions_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const lorebooks = pgTable(
  "lorebooks",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    revision: integer("revision").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("lorebooks_owner_updated_idx").on(table.ownerUserId, table.updatedAt),
    check("lorebooks_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const loreEntries = pgTable(
  "lore_entries",
  {
    id: uuid("id").primaryKey(),
    lorebookId: uuid("lorebook_id")
      .notNull()
      .references(() => lorebooks.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entryKey: text("entry_key").notNull(),
    revision: integer("revision").notNull().default(1),
    ruleJsonb: jsonb("rule_jsonb").$type<Record<string, unknown>>().notNull(),
    content: text("content").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    sortKey: integer("sort_key").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("lore_entries_key_uq").on(table.lorebookId, table.entryKey),
    index("lore_entries_owner_idx").on(table.ownerUserId),
    check("lore_entries_revision_positive", sql`${table.revision} > 0`),
    check("lore_entries_sort_nonnegative", sql`${table.sortKey} >= 0`),
  ],
);

export const presets = pgTable(
  "presets",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    revision: integer("revision").notNull().default(1),
    payloadJsonb: jsonb("payload_jsonb").$type<Record<string, unknown>>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("presets_owner_updated_idx").on(table.ownerUserId, table.updatedAt),
    check("presets_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const regexRules = pgTable(
  "regex_rules",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    revision: integer("revision").notNull().default(1),
    stage: text("stage").notNull(),
    pattern: text("pattern").notNull(),
    flags: text("flags").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("regex_rules_owner_order_idx").on(table.ownerUserId, table.sortOrder),
    check("regex_rules_revision_positive", sql`${table.revision} > 0`),
    check("regex_rules_sort_nonnegative", sql`${table.sortOrder} >= 0`),
    check(
      "regex_rules_stage_valid",
      sql`${table.stage} in ('user_input', 'prompt_build', 'model_output', 'display_only')`,
    ),
  ],
);

export const memoryItems = pgTable(
  "memory_items",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    content: text("content").notNull(),
    sourceMessageId: uuid("source_message_id").references(() => messageNodes.id, {
      onDelete: "set null",
    }),
    scope: text("scope").notNull().default("conversation"),
    locked: boolean("locked").notNull().default(false),
    revision: integer("revision").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("memory_items_owner_conversation_idx").on(table.ownerUserId, table.conversationId),
    check("memory_items_revision_positive", sql`${table.revision} > 0`),
    check(
      "memory_items_kind_valid",
      sql`${table.kind} in ('manual_fact', 'event', 'summary', 'relationship', 'retrieval_hit')`,
    ),
  ],
);

export const syncMutations = pgTable(
  "sync_mutations",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    opId: text("op_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    resultJsonb: jsonb("result_jsonb").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("sync_mutations_owner_op_uq").on(table.ownerUserId, table.opId),
    index("sync_mutations_owner_created_idx").on(table.ownerUserId, table.createdAt),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    operation: text("operation").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadataJsonb: jsonb("metadata_jsonb").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_events_target_idx").on(table.targetType, table.targetId),
    index("audit_events_created_idx").on(table.createdAt),
  ],
);
