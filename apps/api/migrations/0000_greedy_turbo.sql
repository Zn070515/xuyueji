CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"operation" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"metadata_jsonb" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"session_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"head_message_id" uuid,
	"revision" integer DEFAULT 0 NOT NULL,
	"label" text DEFAULT '主线' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_revision_nonnegative" CHECK ("branches"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "character_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"source_format" text DEFAULT 'native' NOT NULL,
	"payload_jsonb" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_versions_revision_positive" CHECK ("character_versions"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"active_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text DEFAULT '未命名会话' NOT NULL,
	"mode" text DEFAULT 'solo' NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"snapshot_digest" text NOT NULL,
	"model_id" text NOT NULL,
	"tariff_version" text NOT NULL,
	"state" text NOT NULL,
	"client_request_id" text NOT NULL,
	"cap_points" integer NOT NULL,
	"cost_points" integer,
	"usage_jsonb" jsonb,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	CONSTRAINT "generation_runs_cap_nonnegative" CHECK ("generation_runs"."cap_points" >= 0),
	CONSTRAINT "generation_runs_cost_nonnegative" CHECK ("generation_runs"."cost_points" is null or "generation_runs"."cost_points" >= 0),
	CONSTRAINT "generation_runs_cost_within_cap" CHECK ("generation_runs"."cost_points" is null or "generation_runs"."cost_points" <= "generation_runs"."cap_points")
);
--> statement-breakpoint
CREATE TABLE "message_nodes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"parent_id" uuid,
	"response_group_id" uuid NOT NULL,
	"role" text NOT NULL,
	"actor_ref" jsonb NOT NULL,
	"content" text NOT NULL,
	"origin_run_id" uuid,
	"tombstone_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_nodes_role_valid" CHECK ("message_nodes"."role" in ('system', 'user', 'assistant'))
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_trade_no" text NOT NULL,
	"merchant_trade_no" text NOT NULL,
	"payload_sha256" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_trade_no" text NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"amount_fen" integer NOT NULL,
	"points" integer NOT NULL,
	"currency" text DEFAULT 'CNY' NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"provider_trade_no" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_orders_amount_positive" CHECK ("payment_orders"."amount_fen" > 0),
	CONSTRAINT "payment_orders_points_positive" CHECK ("payment_orders"."points" > 0),
	CONSTRAINT "payment_orders_status_valid" CHECK ("payment_orders"."status" in ('created', 'pending', 'paid', 'closed', 'expired', 'partially_refunded', 'refunded'))
);
--> statement-breakpoint
CREATE TABLE "sync_changes" (
	"sequence" bigserial PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"revision" integer NOT NULL,
	"op" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_changes_op_valid" CHECK ("sync_changes"."op" in ('upsert', 'delete'))
);
--> statement-breakpoint
CREATE TABLE "tariffs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"model_id" text NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"input_rate" numeric(18, 8) NOT NULL,
	"cached_input_rate" numeric(18, 8) NOT NULL,
	"output_rate" numeric(18, 8) NOT NULL,
	"margin" numeric(8, 4) NOT NULL,
	"currency" text DEFAULT 'CNY' NOT NULL,
	"rounding_rule" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"age_gate_state" text DEFAULT 'unknown' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"delta_available" integer NOT NULL,
	"delta_reserved" integer NOT NULL,
	"ref_kind" text NOT NULL,
	"ref_id" text NOT NULL,
	"unique_key" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_ledger_kind_valid" CHECK ("wallet_ledger"."kind" in ('topup', 'reserve', 'release', 'settlement', 'refund', 'adjustment'))
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"available_points" integer DEFAULT 0 NOT NULL,
	"reserved_points" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_owner_user_id_unique" UNIQUE("owner_user_id"),
	CONSTRAINT "wallets_available_nonnegative" CHECK ("wallets"."available_points" >= 0),
	CONSTRAINT "wallets_reserved_nonnegative" CHECK ("wallets"."reserved_points" >= 0),
	CONSTRAINT "wallets_version_nonnegative" CHECK ("wallets"."version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_versions" ADD CONSTRAINT "character_versions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_versions" ADD CONSTRAINT "character_versions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_nodes" ADD CONSTRAINT "message_nodes_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_nodes" ADD CONSTRAINT "message_nodes_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_changes" ADD CONSTRAINT "sync_changes_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_hash_uq" ON "auth_sessions" USING btree ("session_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "branches_conversation_idx" ON "branches" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "character_versions_revision_uq" ON "character_versions" USING btree ("character_id","revision");--> statement-breakpoint
CREATE INDEX "character_versions_owner_idx" ON "character_versions" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "characters_owner_idx" ON "characters" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "conversations_owner_updated_idx" ON "conversations" USING btree ("owner_user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_runs_client_request_uq" ON "generation_runs" USING btree ("owner_user_id","client_request_id");--> statement-breakpoint
CREATE INDEX "generation_runs_owner_created_idx" ON "generation_runs" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "message_nodes_conversation_created_idx" ON "message_nodes" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "message_nodes_response_group_idx" ON "message_nodes" USING btree ("conversation_id","response_group_id");--> statement-breakpoint
CREATE INDEX "message_nodes_owner_idx" ON "message_nodes" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_trade_uq" ON "payment_events" USING btree ("provider_trade_no");--> statement-breakpoint
CREATE INDEX "payment_events_merchant_trade_idx" ON "payment_events" USING btree ("merchant_trade_no");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_orders_merchant_trade_uq" ON "payment_orders" USING btree ("merchant_trade_no");--> statement-breakpoint
CREATE INDEX "payment_orders_owner_created_idx" ON "payment_orders" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "sync_changes_owner_sequence_idx" ON "sync_changes" USING btree ("owner_user_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "tariffs_version_uq" ON "tariffs" USING btree ("version");--> statement-breakpoint
CREATE INDEX "tariffs_model_effective_idx" ON "tariffs" USING btree ("model_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_ledger_unique_key_uq" ON "wallet_ledger" USING btree ("unique_key");--> statement-breakpoint
CREATE INDEX "wallet_ledger_owner_occurred_idx" ON "wallet_ledger" USING btree ("owner_user_id","occurred_at");