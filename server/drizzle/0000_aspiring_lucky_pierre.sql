CREATE TYPE "public"."account_type" AS ENUM('spending', 'savings');--> statement-breakpoint
CREATE TYPE "public"."category_group" AS ENUM('essential', 'lifestyle', 'savings', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."commitment_direction" AS ENUM('payable', 'receivable');--> statement-breakpoint
CREATE TYPE "public"."commitment_status" AS ENUM('open', 'partial', 'settled', 'written_off');--> statement-breakpoint
CREATE TYPE "public"."fund_bucket_name" AS ENUM('emergency', 'sinking');--> statement-breakpoint
CREATE TYPE "public"."monthly_plan_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."transaction_direction" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."transaction_source" AS ENUM('manual', 'quickadd', 'import');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"device_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"opening_balance_paise" bigint DEFAULT 0 NOT NULL,
	"is_emergency_fund" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"device_id" text NOT NULL,
	"name" text NOT NULL,
	"group" "category_group",
	"monthly_budget_paise" bigint,
	"is_spending" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "category_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"device_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	"alias" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commitment_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"device_id" text NOT NULL,
	"commitment_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"settled_on" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commitments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"device_id" text NOT NULL,
	"direction" "commitment_direction" NOT NULL,
	"counterparty" text NOT NULL,
	"description" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"settled_amount_paise" bigint DEFAULT 0 NOT NULL,
	"category_id" uuid NOT NULL,
	"due_month" text NOT NULL,
	"status" "commitment_status" DEFAULT 'open' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fund_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"device_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"name" "fund_bucket_name" NOT NULL,
	"balance_paise" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monthly_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"device_id" text NOT NULL,
	"year_month" text NOT NULL,
	"salary_paise" bigint NOT NULL,
	"sip_amount_paise" bigint NOT NULL,
	"emergency_transfer_paise" bigint NOT NULL,
	"sinking_transfer_paise" bigint NOT NULL,
	"status" "monthly_plan_status" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plan_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"device_id" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"planned_amount_paise" bigint NOT NULL,
	"actual_amount_paise" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"device_id" text NOT NULL,
	"match_text" text NOT NULL,
	"match_field" text DEFAULT 'description' NOT NULL,
	"amount_min_paise" bigint,
	"amount_max_paise" bigint,
	"category_id" uuid NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"device_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"device_id" text NOT NULL,
	"date" date NOT NULL,
	"amount_paise" bigint NOT NULL,
	"direction" "transaction_direction" NOT NULL,
	"description" text NOT NULL,
	"category_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"note" text,
	"is_excluded" boolean DEFAULT false NOT NULL,
	"source" "transaction_source" NOT NULL,
	"import_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "category_aliases" ADD CONSTRAINT "category_aliases_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commitment_settlements" ADD CONSTRAINT "commitment_settlements_commitment_id_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commitment_settlements" ADD CONSTRAINT "commitment_settlements_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commitments" ADD CONSTRAINT "commitments_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fund_buckets" ADD CONSTRAINT "fund_buckets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_lines" ADD CONSTRAINT "plan_lines_plan_id_monthly_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."monthly_plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_lines" ADD CONSTRAINT "plan_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rules" ADD CONSTRAINT "rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_name_unique" ON "accounts" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "categories_name_unique" ON "categories" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "category_aliases_alias_unique" ON "category_aliases" USING btree ("alias");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fund_buckets_account_name_unique" ON "fund_buckets" USING btree ("account_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_plans_year_month_live_unique" ON "monthly_plans" USING btree ("year_month") WHERE "monthly_plans"."deleted_at" is null;