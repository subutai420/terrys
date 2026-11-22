import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_orders_payment_method" AS ENUM('on-delivery', 'bank-transfer');
  CREATE TYPE "public"."enum_orders_payment_status" AS ENUM('awaiting', 'paid', 'cancelled');
  CREATE TYPE "public"."enum_vouchers_history_event" AS ENUM('issued', 'paid', 'payment-undone', 'redeemed', 'redemption-changed', 'reminder-sent', 'cancelled', 'note');
  CREATE TYPE "public"."enum_vouchers_type" AS ENUM('electronic', 'printed', 'legacy');
  CREATE TYPE "public"."enum_vouchers_status" AS ENUM('issued', 'paid', 'partially-redeemed', 'redeemed', 'cancelled');
  CREATE TYPE "public"."enum_voucher_batches_letter" AS ENUM('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z');
  CREATE TYPE "public"."enum_products_voucher_formats" AS ENUM('electronic', 'printed');
  CREATE TYPE "public"."enum__products_v_version_voucher_formats" AS ENUM('electronic', 'printed');
  CREATE TYPE "public"."enum_settings_vouchers_overdue_action" AS ENUM('flag', 'flag-remind', 'flag-remind-cancel');
  ALTER TYPE "public"."enum_orders_sent_emails_kind" ADD VALUE 'voucher-issued';
  ALTER TYPE "public"."enum_orders_sent_emails_kind" ADD VALUE 'voucher-paid';
  ALTER TYPE "public"."enum_orders_sent_emails_kind" ADD VALUE 'voucher-reminder';
  CREATE TABLE "vouchers_redemptions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"redeemed_in_id" integer,
  	"order_number" varchar,
  	"amount" numeric,
  	"at" timestamp(3) with time zone,
  	"by_id" integer
  );
  
  CREATE TABLE "vouchers_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"event" "enum_vouchers_history_event",
  	"at" timestamp(3) with time zone,
  	"by_id" integer,
  	"note" varchar
  );
  
  CREATE TABLE "vouchers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"value" numeric NOT NULL,
  	"balance" numeric,
  	"expires_on" timestamp(3) with time zone NOT NULL,
  	"code_normalized" varchar,
  	"type" "enum_vouchers_type" DEFAULT 'legacy' NOT NULL,
  	"status" "enum_vouchers_status" DEFAULT 'issued' NOT NULL,
  	"batch_id" integer,
  	"order_id" integer,
  	"order_number" varchar,
  	"recipient_name" varchar,
  	"message" varchar,
  	"paid_at" timestamp(3) with time zone,
  	"paid_by_id" integer,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "voucher_batches" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"letter" "enum_voucher_batches_letter" NOT NULL,
  	"expires_on" timestamp(3) with time zone NOT NULL,
  	"active" boolean DEFAULT false,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "products_voucher_formats" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_products_voucher_formats",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_products_v_version_voucher_formats" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__products_v_version_voucher_formats",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "orders_voucher_redemptions" ADD COLUMN "voucher_id" integer;
  ALTER TABLE "orders" ADD COLUMN "voucher_details_recipient_name" varchar;
  ALTER TABLE "orders" ADD COLUMN "voucher_details_message" varchar;
  ALTER TABLE "orders" ADD COLUMN "payment_method" "enum_orders_payment_method" DEFAULT 'on-delivery';
  ALTER TABLE "orders" ADD COLUMN "payment_status" "enum_orders_payment_status";
  ALTER TABLE "orders" ADD COLUMN "payment_amount" numeric;
  ALTER TABLE "orders" ADD COLUMN "payment_variable_symbol" varchar;
  ALTER TABLE "orders" ADD COLUMN "payment_account" varchar;
  ALTER TABLE "orders" ADD COLUMN "payment_due_at" timestamp(3) with time zone;
  ALTER TABLE "orders" ADD COLUMN "payment_paid_on" timestamp(3) with time zone;
  ALTER TABLE "orders" ADD COLUMN "payment_marked_paid_at" timestamp(3) with time zone;
  ALTER TABLE "orders" ADD COLUMN "payment_marked_paid_by_id" integer;
  ALTER TABLE "orders" ADD COLUMN "payment_reminder_sent_at" timestamp(3) with time zone;
  ALTER TABLE "products" ADD COLUMN "voucher_enabled" boolean DEFAULT false;
  ALTER TABLE "products" ADD COLUMN "voucher_value" numeric;
  ALTER TABLE "_products_v" ADD COLUMN "version_voucher_enabled" boolean DEFAULT false;
  ALTER TABLE "_products_v" ADD COLUMN "version_voucher_value" numeric;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "vouchers_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "voucher_batches_id" integer;
  ALTER TABLE "settings" ADD COLUMN "vouchers_bank_account" varchar;
  ALTER TABLE "settings" ADD COLUMN "vouchers_payment_due_hours" numeric DEFAULT 72 NOT NULL;
  ALTER TABLE "settings" ADD COLUMN "vouchers_overdue_action" "enum_settings_vouchers_overdue_action" DEFAULT 'flag-remind' NOT NULL;
  ALTER TABLE "settings" ADD COLUMN "vouchers_auto_cancel_after_days" numeric DEFAULT 14;
  ALTER TABLE "marketing" ADD COLUMN "vouchers_include_in_feeds" boolean DEFAULT false;
  ALTER TABLE "marketing" ADD COLUMN "vouchers_heureka_category" varchar DEFAULT 'Heureka.cz | Hobby | Zábava | Originální dárky | Dárkové poukazy';
  ALTER TABLE "marketing" ADD COLUMN "vouchers_zbozi_category" varchar DEFAULT 'Kultura a zábava | Volný čas | Oslavy a dárky | Dárkové poukazy';
  ALTER TABLE "marketing" ADD COLUMN "vouchers_heureka_for_voucher_orders" boolean DEFAULT false;
  ALTER TABLE "vouchers_redemptions" ADD CONSTRAINT "vouchers_redemptions_redeemed_in_id_orders_id_fk" FOREIGN KEY ("redeemed_in_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vouchers_redemptions" ADD CONSTRAINT "vouchers_redemptions_by_id_users_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vouchers_redemptions" ADD CONSTRAINT "vouchers_redemptions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."vouchers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vouchers_history" ADD CONSTRAINT "vouchers_history_by_id_users_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vouchers_history" ADD CONSTRAINT "vouchers_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."vouchers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_batch_id_voucher_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."voucher_batches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_paid_by_id_users_id_fk" FOREIGN KEY ("paid_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_voucher_formats" ADD CONSTRAINT "products_voucher_formats_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_voucher_formats" ADD CONSTRAINT "_products_v_version_voucher_formats_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "vouchers_redemptions_order_idx" ON "vouchers_redemptions" USING btree ("_order");
  CREATE INDEX "vouchers_redemptions_parent_id_idx" ON "vouchers_redemptions" USING btree ("_parent_id");
  CREATE INDEX "vouchers_redemptions_redeemed_in_idx" ON "vouchers_redemptions" USING btree ("redeemed_in_id");
  CREATE INDEX "vouchers_redemptions_by_idx" ON "vouchers_redemptions" USING btree ("by_id");
  CREATE INDEX "vouchers_history_order_idx" ON "vouchers_history" USING btree ("_order");
  CREATE INDEX "vouchers_history_parent_id_idx" ON "vouchers_history" USING btree ("_parent_id");
  CREATE INDEX "vouchers_history_by_idx" ON "vouchers_history" USING btree ("by_id");
  CREATE UNIQUE INDEX "vouchers_code_normalized_idx" ON "vouchers" USING btree ("code_normalized");
  CREATE INDEX "vouchers_status_idx" ON "vouchers" USING btree ("status");
  CREATE INDEX "vouchers_batch_idx" ON "vouchers" USING btree ("batch_id");
  CREATE INDEX "vouchers_order_idx" ON "vouchers" USING btree ("order_id");
  CREATE INDEX "vouchers_order_number_idx" ON "vouchers" USING btree ("order_number");
  CREATE INDEX "vouchers_paid_by_idx" ON "vouchers" USING btree ("paid_by_id");
  CREATE INDEX "vouchers_updated_at_idx" ON "vouchers" USING btree ("updated_at");
  CREATE INDEX "vouchers_created_at_idx" ON "vouchers" USING btree ("created_at");
  CREATE UNIQUE INDEX "voucher_batches_letter_idx" ON "voucher_batches" USING btree ("letter");
  CREATE INDEX "voucher_batches_active_idx" ON "voucher_batches" USING btree ("active");
  CREATE INDEX "voucher_batches_updated_at_idx" ON "voucher_batches" USING btree ("updated_at");
  CREATE INDEX "voucher_batches_created_at_idx" ON "voucher_batches" USING btree ("created_at");
  CREATE INDEX "products_voucher_formats_order_idx" ON "products_voucher_formats" USING btree ("order");
  CREATE INDEX "products_voucher_formats_parent_idx" ON "products_voucher_formats" USING btree ("parent_id");
  CREATE INDEX "_products_v_version_voucher_formats_order_idx" ON "_products_v_version_voucher_formats" USING btree ("order");
  CREATE INDEX "_products_v_version_voucher_formats_parent_idx" ON "_products_v_version_voucher_formats" USING btree ("parent_id");
  ALTER TABLE "orders_voucher_redemptions" ADD CONSTRAINT "orders_voucher_redemptions_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_marked_paid_by_id_users_id_fk" FOREIGN KEY ("payment_marked_paid_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_vouchers_fk" FOREIGN KEY ("vouchers_id") REFERENCES "public"."vouchers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_voucher_batches_fk" FOREIGN KEY ("voucher_batches_id") REFERENCES "public"."voucher_batches"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "orders_voucher_redemptions_voucher_idx" ON "orders_voucher_redemptions" USING btree ("voucher_id");
  CREATE INDEX "orders_payment_payment_status_idx" ON "orders" USING btree ("payment_status");
  CREATE INDEX "orders_payment_payment_variable_symbol_idx" ON "orders" USING btree ("payment_variable_symbol");
  CREATE INDEX "orders_payment_payment_due_at_idx" ON "orders" USING btree ("payment_due_at");
  CREATE INDEX "orders_payment_payment_marked_paid_by_idx" ON "orders" USING btree ("payment_marked_paid_by_id");
  CREATE INDEX "products_voucher_voucher_enabled_idx" ON "products" USING btree ("voucher_enabled");
  CREATE INDEX "_products_v_version_voucher_version_voucher_enabled_idx" ON "_products_v" USING btree ("version_voucher_enabled");
  CREATE INDEX "payload_locked_documents_rels_vouchers_id_idx" ON "payload_locked_documents_rels" USING btree ("vouchers_id");
  CREATE INDEX "payload_locked_documents_rels_voucher_batches_id_idx" ON "payload_locked_documents_rels" USING btree ("voucher_batches_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "vouchers_redemptions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "vouchers_history" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "vouchers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "voucher_batches" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_voucher_formats" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_products_v_version_voucher_formats" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "vouchers_redemptions" CASCADE;
  DROP TABLE "vouchers_history" CASCADE;
  DROP TABLE "vouchers" CASCADE;
  DROP TABLE "voucher_batches" CASCADE;
  DROP TABLE "products_voucher_formats" CASCADE;
  DROP TABLE "_products_v_version_voucher_formats" CASCADE;
  ALTER TABLE "orders_voucher_redemptions" DROP CONSTRAINT "orders_voucher_redemptions_voucher_id_vouchers_id_fk";
  
  ALTER TABLE "orders" DROP CONSTRAINT "orders_payment_marked_paid_by_id_users_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_vouchers_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_voucher_batches_fk";
  
  ALTER TABLE "orders_sent_emails" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_orders_sent_emails_kind";
  CREATE TYPE "public"."enum_orders_sent_emails_kind" AS ENUM('final-price', 'shipped', 'ready-for-pickup', 'cancelled');
  ALTER TABLE "orders_sent_emails" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_orders_sent_emails_kind" USING "kind"::"public"."enum_orders_sent_emails_kind";
  DROP INDEX "orders_voucher_redemptions_voucher_idx";
  DROP INDEX "orders_payment_payment_status_idx";
  DROP INDEX "orders_payment_payment_variable_symbol_idx";
  DROP INDEX "orders_payment_payment_due_at_idx";
  DROP INDEX "orders_payment_payment_marked_paid_by_idx";
  DROP INDEX "products_voucher_voucher_enabled_idx";
  DROP INDEX "_products_v_version_voucher_version_voucher_enabled_idx";
  DROP INDEX "payload_locked_documents_rels_vouchers_id_idx";
  DROP INDEX "payload_locked_documents_rels_voucher_batches_id_idx";
  ALTER TABLE "orders_voucher_redemptions" DROP COLUMN "voucher_id";
  ALTER TABLE "orders" DROP COLUMN "voucher_details_recipient_name";
  ALTER TABLE "orders" DROP COLUMN "voucher_details_message";
  ALTER TABLE "orders" DROP COLUMN "payment_method";
  ALTER TABLE "orders" DROP COLUMN "payment_status";
  ALTER TABLE "orders" DROP COLUMN "payment_amount";
  ALTER TABLE "orders" DROP COLUMN "payment_variable_symbol";
  ALTER TABLE "orders" DROP COLUMN "payment_account";
  ALTER TABLE "orders" DROP COLUMN "payment_due_at";
  ALTER TABLE "orders" DROP COLUMN "payment_paid_on";
  ALTER TABLE "orders" DROP COLUMN "payment_marked_paid_at";
  ALTER TABLE "orders" DROP COLUMN "payment_marked_paid_by_id";
  ALTER TABLE "orders" DROP COLUMN "payment_reminder_sent_at";
  ALTER TABLE "products" DROP COLUMN "voucher_enabled";
  ALTER TABLE "products" DROP COLUMN "voucher_value";
  ALTER TABLE "_products_v" DROP COLUMN "version_voucher_enabled";
  ALTER TABLE "_products_v" DROP COLUMN "version_voucher_value";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "vouchers_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "voucher_batches_id";
  ALTER TABLE "settings" DROP COLUMN "vouchers_bank_account";
  ALTER TABLE "settings" DROP COLUMN "vouchers_payment_due_hours";
  ALTER TABLE "settings" DROP COLUMN "vouchers_overdue_action";
  ALTER TABLE "settings" DROP COLUMN "vouchers_auto_cancel_after_days";
  ALTER TABLE "marketing" DROP COLUMN "vouchers_include_in_feeds";
  ALTER TABLE "marketing" DROP COLUMN "vouchers_heureka_category";
  ALTER TABLE "marketing" DROP COLUMN "vouchers_zbozi_category";
  ALTER TABLE "marketing" DROP COLUMN "vouchers_heureka_for_voucher_orders";
  DROP TYPE "public"."enum_orders_payment_method";
  DROP TYPE "public"."enum_orders_payment_status";
  DROP TYPE "public"."enum_vouchers_history_event";
  DROP TYPE "public"."enum_vouchers_type";
  DROP TYPE "public"."enum_vouchers_status";
  DROP TYPE "public"."enum_voucher_batches_letter";
  DROP TYPE "public"."enum_products_voucher_formats";
  DROP TYPE "public"."enum__products_v_version_voucher_formats";
  DROP TYPE "public"."enum_settings_vouchers_overdue_action";`)
}
