import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_orders_lines_resolution" AS ENUM('weighed', 'substituted', 'unavailable', 'piece');
  CREATE TYPE "public"."enum_orders_status_history_status" AS ENUM('received', 'weighed', 'shipped', 'ready-for-pickup', 'delivered', 'picked-up', 'cancelled');
  CREATE TYPE "public"."enum_orders_sent_emails_kind" AS ENUM('final-price', 'shipped', 'ready-for-pickup', 'cancelled');
  CREATE TYPE "public"."enum_orders_sent_emails_status" AS ENUM('pending', 'sent', 'outbox', 'failed', 'skipped');
  CREATE TYPE "public"."enum_orders_shipment_provider" AS ENUM('balikobot', 'simulation');
  CREATE TABLE "orders_totals_vat_final" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"rate" numeric,
  	"base" numeric,
  	"vat" numeric,
  	"gross" numeric
  );
  
  CREATE TABLE "orders_voucher_redemptions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"amount" numeric NOT NULL,
  	"note" varchar,
  	"recorded_by_id" integer,
  	"recorded_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "orders_status_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"status" "enum_orders_status_history_status",
  	"at" timestamp(3) with time zone,
  	"by_id" integer,
  	"note" varchar
  );
  
  CREATE TABLE "orders_sent_emails" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_orders_sent_emails_kind",
  	"status" "enum_orders_sent_emails_status",
  	"at" timestamp(3) with time zone,
  	"by_id" integer,
  	"to" varchar,
  	"subject" varchar,
  	"error" varchar
  );
  
  CREATE TABLE "order_audit_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order_id" integer,
  	"order_number" varchar,
  	"at" timestamp(3) with time zone NOT NULL,
  	"user_id" integer,
  	"user_email" varchar,
  	"field" varchar NOT NULL,
  	"line_id" varchar,
  	"old_value" varchar,
  	"new_value" varchar,
  	"summary" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "orders_lines" ADD COLUMN "resolution" "enum_orders_lines_resolution";
  ALTER TABLE "orders_lines" ADD COLUMN "piece_weights" varchar;
  ALTER TABLE "orders_lines" ADD COLUMN "over_tolerance" boolean;
  ALTER TABLE "orders_lines" ADD COLUMN "tolerance_note" varchar;
  ALTER TABLE "orders_lines" ADD COLUMN "weigh_note" varchar;
  ALTER TABLE "orders" ADD COLUMN "needs_review" boolean;
  ALTER TABLE "orders" ADD COLUMN "review_reasons" varchar;
  ALTER TABLE "orders" ADD COLUMN "amount_due" numeric;
  ALTER TABLE "orders" ADD COLUMN "totals_voucher_total" numeric;
  ALTER TABLE "orders" ADD COLUMN "totals_amount_due" numeric;
  ALTER TABLE "orders" ADD COLUMN "fulfilment_weighed_at" timestamp(3) with time zone;
  ALTER TABLE "orders" ADD COLUMN "fulfilment_weighed_by_id" integer;
  ALTER TABLE "orders" ADD COLUMN "fulfilment_finalised_at" timestamp(3) with time zone;
  ALTER TABLE "orders" ADD COLUMN "fulfilment_finalised_by_id" integer;
  ALTER TABLE "orders" ADD COLUMN "shipment_provider" "enum_orders_shipment_provider";
  ALTER TABLE "orders" ADD COLUMN "shipment_carrier_code" varchar;
  ALTER TABLE "orders" ADD COLUMN "shipment_service_code" varchar;
  ALTER TABLE "orders" ADD COLUMN "shipment_package_id" varchar;
  ALTER TABLE "orders" ADD COLUMN "shipment_label_created_at" timestamp(3) with time zone;
  ALTER TABLE "orders" ADD COLUMN "shipment_handed_over_at" timestamp(3) with time zone;
  ALTER TABLE "orders" ADD COLUMN "shipment_batch_id" varchar;
  ALTER TABLE "orders" ADD COLUMN "shipment_attempt" numeric DEFAULT 0;
  ALTER TABLE "orders" ADD COLUMN "shipment_label_url" varchar;
  ALTER TABLE "orders" ADD COLUMN "shipment_last_error" varchar;
  ALTER TABLE "orders" ADD COLUMN "cancellation_reason" varchar;
  ALTER TABLE "orders" ADD COLUMN "cancellation_cancelled_at" timestamp(3) with time zone;
  ALTER TABLE "orders" ADD COLUMN "cancellation_cancelled_by_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "order_audit_log_id" integer;
  ALTER TABLE "settings" ADD COLUMN "orders_weight_tolerance_percent" numeric DEFAULT 15 NOT NULL;
  ALTER TABLE "settings" ADD COLUMN "orders_packaging_weight_grams" numeric DEFAULT 1000 NOT NULL;
  ALTER TABLE "orders_totals_vat_final" ADD CONSTRAINT "orders_totals_vat_final_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders_voucher_redemptions" ADD CONSTRAINT "orders_voucher_redemptions_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_voucher_redemptions" ADD CONSTRAINT "orders_voucher_redemptions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders_status_history" ADD CONSTRAINT "orders_status_history_by_id_users_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_status_history" ADD CONSTRAINT "orders_status_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders_sent_emails" ADD CONSTRAINT "orders_sent_emails_by_id_users_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_sent_emails" ADD CONSTRAINT "orders_sent_emails_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "order_audit_log" ADD CONSTRAINT "order_audit_log_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "order_audit_log" ADD CONSTRAINT "order_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "orders_totals_vat_final_order_idx" ON "orders_totals_vat_final" USING btree ("_order");
  CREATE INDEX "orders_totals_vat_final_parent_id_idx" ON "orders_totals_vat_final" USING btree ("_parent_id");
  CREATE INDEX "orders_voucher_redemptions_order_idx" ON "orders_voucher_redemptions" USING btree ("_order");
  CREATE INDEX "orders_voucher_redemptions_parent_id_idx" ON "orders_voucher_redemptions" USING btree ("_parent_id");
  CREATE INDEX "orders_voucher_redemptions_recorded_by_idx" ON "orders_voucher_redemptions" USING btree ("recorded_by_id");
  CREATE INDEX "orders_status_history_order_idx" ON "orders_status_history" USING btree ("_order");
  CREATE INDEX "orders_status_history_parent_id_idx" ON "orders_status_history" USING btree ("_parent_id");
  CREATE INDEX "orders_status_history_by_idx" ON "orders_status_history" USING btree ("by_id");
  CREATE INDEX "orders_sent_emails_order_idx" ON "orders_sent_emails" USING btree ("_order");
  CREATE INDEX "orders_sent_emails_parent_id_idx" ON "orders_sent_emails" USING btree ("_parent_id");
  CREATE INDEX "orders_sent_emails_by_idx" ON "orders_sent_emails" USING btree ("by_id");
  CREATE INDEX "order_audit_log_order_idx" ON "order_audit_log" USING btree ("order_id");
  CREATE INDEX "order_audit_log_order_number_idx" ON "order_audit_log" USING btree ("order_number");
  CREATE INDEX "order_audit_log_at_idx" ON "order_audit_log" USING btree ("at");
  CREATE INDEX "order_audit_log_user_idx" ON "order_audit_log" USING btree ("user_id");
  CREATE INDEX "order_audit_log_updated_at_idx" ON "order_audit_log" USING btree ("updated_at");
  CREATE INDEX "order_audit_log_created_at_idx" ON "order_audit_log" USING btree ("created_at");
  ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfilment_weighed_by_id_users_id_fk" FOREIGN KEY ("fulfilment_weighed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfilment_finalised_by_id_users_id_fk" FOREIGN KEY ("fulfilment_finalised_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_cancellation_cancelled_by_id_users_id_fk" FOREIGN KEY ("cancellation_cancelled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_order_audit_log_fk" FOREIGN KEY ("order_audit_log_id") REFERENCES "public"."order_audit_log"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "orders_needs_review_idx" ON "orders" USING btree ("needs_review");
  CREATE UNIQUE INDEX "orders_invoice_number_idx" ON "orders" USING btree ("invoice_number");
  CREATE INDEX "orders_fulfilment_fulfilment_weighed_by_idx" ON "orders" USING btree ("fulfilment_weighed_by_id");
  CREATE INDEX "orders_fulfilment_fulfilment_finalised_by_idx" ON "orders" USING btree ("fulfilment_finalised_by_id");
  CREATE INDEX "orders_cancellation_cancellation_cancelled_by_idx" ON "orders" USING btree ("cancellation_cancelled_by_id");
  CREATE INDEX "payload_locked_documents_rels_order_audit_log_id_idx" ON "payload_locked_documents_rels" USING btree ("order_audit_log_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "orders_totals_vat_final" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "orders_voucher_redemptions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "orders_status_history" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "orders_sent_emails" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "order_audit_log" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "orders_totals_vat_final" CASCADE;
  DROP TABLE "orders_voucher_redemptions" CASCADE;
  DROP TABLE "orders_status_history" CASCADE;
  DROP TABLE "orders_sent_emails" CASCADE;
  DROP TABLE "order_audit_log" CASCADE;
  ALTER TABLE "orders" DROP CONSTRAINT "orders_fulfilment_weighed_by_id_users_id_fk";
  
  ALTER TABLE "orders" DROP CONSTRAINT "orders_fulfilment_finalised_by_id_users_id_fk";
  
  ALTER TABLE "orders" DROP CONSTRAINT "orders_cancellation_cancelled_by_id_users_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_order_audit_log_fk";
  
  DROP INDEX "orders_needs_review_idx";
  DROP INDEX "orders_invoice_number_idx";
  DROP INDEX "orders_fulfilment_fulfilment_weighed_by_idx";
  DROP INDEX "orders_fulfilment_fulfilment_finalised_by_idx";
  DROP INDEX "orders_cancellation_cancellation_cancelled_by_idx";
  DROP INDEX "payload_locked_documents_rels_order_audit_log_id_idx";
  ALTER TABLE "orders_lines" DROP COLUMN "resolution";
  ALTER TABLE "orders_lines" DROP COLUMN "piece_weights";
  ALTER TABLE "orders_lines" DROP COLUMN "over_tolerance";
  ALTER TABLE "orders_lines" DROP COLUMN "tolerance_note";
  ALTER TABLE "orders_lines" DROP COLUMN "weigh_note";
  ALTER TABLE "orders" DROP COLUMN "needs_review";
  ALTER TABLE "orders" DROP COLUMN "review_reasons";
  ALTER TABLE "orders" DROP COLUMN "amount_due";
  ALTER TABLE "orders" DROP COLUMN "totals_voucher_total";
  ALTER TABLE "orders" DROP COLUMN "totals_amount_due";
  ALTER TABLE "orders" DROP COLUMN "fulfilment_weighed_at";
  ALTER TABLE "orders" DROP COLUMN "fulfilment_weighed_by_id";
  ALTER TABLE "orders" DROP COLUMN "fulfilment_finalised_at";
  ALTER TABLE "orders" DROP COLUMN "fulfilment_finalised_by_id";
  ALTER TABLE "orders" DROP COLUMN "shipment_provider";
  ALTER TABLE "orders" DROP COLUMN "shipment_carrier_code";
  ALTER TABLE "orders" DROP COLUMN "shipment_service_code";
  ALTER TABLE "orders" DROP COLUMN "shipment_package_id";
  ALTER TABLE "orders" DROP COLUMN "shipment_label_created_at";
  ALTER TABLE "orders" DROP COLUMN "shipment_handed_over_at";
  ALTER TABLE "orders" DROP COLUMN "shipment_batch_id";
  ALTER TABLE "orders" DROP COLUMN "shipment_attempt";
  ALTER TABLE "orders" DROP COLUMN "shipment_label_url";
  ALTER TABLE "orders" DROP COLUMN "shipment_last_error";
  ALTER TABLE "orders" DROP COLUMN "cancellation_reason";
  ALTER TABLE "orders" DROP COLUMN "cancellation_cancelled_at";
  ALTER TABLE "orders" DROP COLUMN "cancellation_cancelled_by_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "order_audit_log_id";
  ALTER TABLE "settings" DROP COLUMN "orders_weight_tolerance_percent";
  ALTER TABLE "settings" DROP COLUMN "orders_packaging_weight_grams";
  DROP TYPE "public"."enum_orders_lines_resolution";
  DROP TYPE "public"."enum_orders_status_history_status";
  DROP TYPE "public"."enum_orders_sent_emails_kind";
  DROP TYPE "public"."enum_orders_sent_emails_status";
  DROP TYPE "public"."enum_orders_shipment_provider";`)
}
