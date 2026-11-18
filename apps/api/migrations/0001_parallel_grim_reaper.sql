CREATE TABLE "lore_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lorebook_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"entry_key" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"rule_jsonb" jsonb NOT NULL,
	"content" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_key" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lore_entries_revision_positive" CHECK ("lore_entries"."revision" > 0),
	CONSTRAINT "lore_entries_sort_nonnegative" CHECK ("lore_entries"."sort_key" >= 0)
);
--> statement-breakpoint
CREATE TABLE "lorebooks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lorebooks_revision_positive" CHECK ("lorebooks"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "memory_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"conversation_id" uuid,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"source_message_id" uuid,
	"scope" text DEFAULT 'conversation' NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_items_revision_positive" CHECK ("memory_items"."revision" > 0),
	CONSTRAINT "memory_items_kind_valid" CHECK ("memory_items"."kind" in ('manual_fact', 'event', 'summary', 'relationship', 'retrieval_hit'))
);
--> statement-breakpoint
CREATE TABLE "persona_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"persona_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"payload_jsonb" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "persona_versions_revision_positive" CHECK ("persona_versions"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"active_version_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"payload_jsonb" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presets_revision_positive" CHECK ("presets"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "regex_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"stage" text NOT NULL,
	"pattern" text NOT NULL,
	"flags" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regex_rules_revision_positive" CHECK ("regex_rules"."revision" > 0),
	CONSTRAINT "regex_rules_sort_nonnegative" CHECK ("regex_rules"."sort_order" >= 0),
	CONSTRAINT "regex_rules_stage_valid" CHECK ("regex_rules"."stage" in ('user_input', 'prompt_build', 'model_output', 'display_only'))
);
--> statement-breakpoint
CREATE TABLE "sync_mutations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"op_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"result_jsonb" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_normalized" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "lore_entries" ADD CONSTRAINT "lore_entries_lorebook_id_lorebooks_id_fk" FOREIGN KEY ("lorebook_id") REFERENCES "public"."lorebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_entries" ADD CONSTRAINT "lore_entries_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lorebooks" ADD CONSTRAINT "lorebooks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_source_message_id_message_nodes_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."message_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_versions" ADD CONSTRAINT "persona_versions_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_versions" ADD CONSTRAINT "persona_versions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presets" ADD CONSTRAINT "presets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regex_rules" ADD CONSTRAINT "regex_rules_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lore_entries_key_uq" ON "lore_entries" USING btree ("lorebook_id","entry_key");--> statement-breakpoint
CREATE INDEX "lore_entries_owner_idx" ON "lore_entries" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "lorebooks_owner_updated_idx" ON "lorebooks" USING btree ("owner_user_id","updated_at");--> statement-breakpoint
CREATE INDEX "memory_items_owner_conversation_idx" ON "memory_items" USING btree ("owner_user_id","conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "persona_versions_revision_uq" ON "persona_versions" USING btree ("persona_id","revision");--> statement-breakpoint
CREATE INDEX "persona_versions_owner_idx" ON "persona_versions" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "personas_owner_idx" ON "personas" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "presets_owner_updated_idx" ON "presets" USING btree ("owner_user_id","updated_at");--> statement-breakpoint
CREATE INDEX "regex_rules_owner_order_idx" ON "regex_rules" USING btree ("owner_user_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_mutations_owner_op_uq" ON "sync_mutations" USING btree ("owner_user_id","op_id");--> statement-breakpoint
CREATE INDEX "sync_mutations_owner_created_idx" ON "sync_mutations" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_normalized_uq" ON "users" USING btree ("email_normalized");