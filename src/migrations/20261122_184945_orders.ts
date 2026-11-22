import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_orders_lines_price_unit" AS ENUM('kg', '100g', 'piece');
  CREATE TYPE "public"."enum_orders_lines_vat_rate" AS ENUM('12', '21', '0');
  CREATE TYPE "public"."enum_orders_status" AS ENUM('received', 'weighed', 'shipped', 'ready-for-pickup', 'delivered', 'picked-up', 'cancelled');
  CREATE TYPE "public"."enum_orders_kind" AS ENUM('goods', 'voucher');
  CREATE TYPE "public"."enum_orders_shipping_address_check_status" AS ENUM('valid', 'corrected', 'invalid', 'skipped');
  CREATE TYPE "public"."enum_orders_delivery_method_type" AS ENUM('own-delivery', 'courier', 'pickup');
  CREATE TYPE "public"."enum_orders_emails_customer_status" AS ENUM('pending', 'sent', 'outbox', 'failed', 'skipped');
  CREATE TYPE "public"."enum_orders_emails_shop_status" AS ENUM('pending', 'sent', 'outbox', 'failed', 'skipped');
  CREATE TYPE "public"."enum_withdrawals_status" AS ENUM('new', 'processing', 'resolved');
  CREATE TYPE "public"."enum_withdrawals_confirmation_status" AS ENUM('pending', 'sent', 'outbox', 'failed', 'skipped');
  CREATE TABLE "orders_lines" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"product_title" varchar NOT NULL,
  	"variant_label" varchar,
  	"quantity" numeric NOT NULL,
  	"product_id" integer,
  	"unit_price" numeric NOT NULL,
  	"price_unit" "enum_orders_lines_price_unit" NOT NULL,
  	"vat_rate" "enum_orders_lines_vat_rate" NOT NULL,
  	"sku" varchar,
  	"variant_id" varchar,
  	"estimated_weight_grams" numeric,
  	"estimated_price" numeric NOT NULL,
  	"actual_weight_grams" numeric,
  	"final_price" numeric
  );
  
  CREATE TABLE "orders_totals_vat" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"rate" numeric,
  	"base" numeric,
  	"vat" numeric,
  	"gross" numeric
  );
  
  CREATE TABLE "orders" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order_number" varchar NOT NULL,
  	"status" "enum_orders_status" DEFAULT 'received' NOT NULL,
  	"kind" "enum_orders_kind" DEFAULT 'goods' NOT NULL,
  	"customer_name" varchar,
  	"contact_email" varchar,
  	"contact_phone" varchar,
  	"scheduled_date" varchar,
  	"shipping_label" varchar,
  	"total_estimate" numeric,
  	"totals_goods_estimate" numeric NOT NULL,
  	"totals_delivery_price" numeric NOT NULL,
  	"totals_total_estimate" numeric NOT NULL,
  	"totals_goods_final" numeric,
  	"totals_total_final" numeric,
  	"voucher_code" varchar,
  	"customer_first_name" varchar NOT NULL,
  	"customer_last_name" varchar NOT NULL,
  	"customer_email" varchar NOT NULL,
  	"customer_phone" varchar NOT NULL,
  	"customer_company_name" varchar,
  	"customer_ico" varchar,
  	"customer_dic" varchar,
  	"shipping_address_street" varchar,
  	"shipping_address_city" varchar,
  	"shipping_address_postcode" varchar,
  	"shipping_address_check_status" "enum_orders_shipping_address_check_status",
  	"shipping_address_check_note" varchar,
  	"delivery_method_name" varchar,
  	"delivery_method_type" "enum_orders_delivery_method_type",
  	"delivery_price" numeric,
  	"delivery_date" varchar,
  	"delivery_postcode" varchar,
  	"delivery_method_id" integer,
  	"delivery_method_slug" varchar,
  	"delivery_pickup_location_name" varchar,
  	"delivery_pickup_location_street" varchar,
  	"delivery_pickup_location_city" varchar,
  	"delivery_pickup_location_zip" varchar,
  	"delivery_pickup_location_opening_hours_note" varchar,
  	"customer_note" varchar,
  	"internal_note" varchar,
  	"invoice_number" varchar,
  	"tracking_number" varchar,
  	"tracking_url" varchar,
  	"emails_customer_status" "enum_orders_emails_customer_status" DEFAULT 'pending',
  	"emails_customer_sent_at" timestamp(3) with time zone,
  	"emails_customer_error" varchar,
  	"emails_shop_status" "enum_orders_emails_shop_status" DEFAULT 'pending',
  	"emails_shop_sent_at" timestamp(3) with time zone,
  	"emails_shop_error" varchar,
  	"consents_terms_accepted_at" timestamp(3) with time zone,
  	"consents_terms_page_updated_at" timestamp(3) with time zone,
  	"consents_privacy_notice_at" timestamp(3) with time zone,
  	"consents_newsletter" boolean,
  	"consents_newsletter_at" timestamp(3) with time zone,
  	"consents_heureka_opt_out" boolean,
  	"attribution_utm_source" varchar,
  	"attribution_utm_medium" varchar,
  	"attribution_utm_campaign" varchar,
  	"attribution_utm_term" varchar,
  	"attribution_utm_content" varchar,
  	"attribution_first_seen_at" varchar,
  	"attribution_gclid" varchar,
  	"attribution_fbclid" varchar,
  	"attribution_referrer" varchar,
  	"attribution_landing_page" varchar,
  	"event_id" varchar,
  	"access_token" varchar NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "withdrawals" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"status" "enum_withdrawals_status" DEFAULT 'new' NOT NULL,
  	"submitted_at" timestamp(3) with time zone NOT NULL,
  	"order_id" integer,
  	"name" varchar NOT NULL,
  	"email" varchar NOT NULL,
  	"order_number_entered" varchar NOT NULL,
  	"phone" varchar,
  	"items" varchar,
  	"message" varchar,
  	"confirmation_status" "enum_withdrawals_confirmation_status" DEFAULT 'pending',
  	"confirmation_sent_at" timestamp(3) with time zone,
  	"confirmation_error" varchar,
  	"internal_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "orders_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "withdrawals_id" integer;
  ALTER TABLE "settings" ADD COLUMN "orders_notification_email" varchar;
  ALTER TABLE "orders_lines" ADD CONSTRAINT "orders_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_lines" ADD CONSTRAINT "orders_lines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders_totals_vat" ADD CONSTRAINT "orders_totals_vat_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_method_id_shipping_methods_id_fk" FOREIGN KEY ("delivery_method_id") REFERENCES "public"."shipping_methods"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "orders_lines_order_idx" ON "orders_lines" USING btree ("_order");
  CREATE INDEX "orders_lines_parent_id_idx" ON "orders_lines" USING btree ("_parent_id");
  CREATE INDEX "orders_lines_product_idx" ON "orders_lines" USING btree ("product_id");
  CREATE INDEX "orders_totals_vat_order_idx" ON "orders_totals_vat" USING btree ("_order");
  CREATE INDEX "orders_totals_vat_parent_id_idx" ON "orders_totals_vat" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "orders_order_number_idx" ON "orders" USING btree ("order_number");
  CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");
  CREATE INDEX "orders_contact_email_idx" ON "orders" USING btree ("contact_email");
  CREATE INDEX "orders_scheduled_date_idx" ON "orders" USING btree ("scheduled_date");
  CREATE INDEX "orders_delivery_delivery_method_idx" ON "orders" USING btree ("delivery_method_id");
  CREATE INDEX "orders_event_id_idx" ON "orders" USING btree ("event_id");
  CREATE UNIQUE INDEX "orders_access_token_idx" ON "orders" USING btree ("access_token");
  CREATE UNIQUE INDEX "orders_idempotency_key_idx" ON "orders" USING btree ("idempotency_key");
  CREATE INDEX "orders_updated_at_idx" ON "orders" USING btree ("updated_at");
  CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");
  CREATE INDEX "withdrawals_order_idx" ON "withdrawals" USING btree ("order_id");
  CREATE INDEX "withdrawals_updated_at_idx" ON "withdrawals" USING btree ("updated_at");
  CREATE INDEX "withdrawals_created_at_idx" ON "withdrawals" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_orders_fk" FOREIGN KEY ("orders_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_withdrawals_fk" FOREIGN KEY ("withdrawals_id") REFERENCES "public"."withdrawals"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_orders_id_idx" ON "payload_locked_documents_rels" USING btree ("orders_id");
  CREATE INDEX "payload_locked_documents_rels_withdrawals_id_idx" ON "payload_locked_documents_rels" USING btree ("withdrawals_id");`)
  // Hand-added (stage 4): race-safe sequential order numbers, see src/orders/orderNumber.ts.
  await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS "order_number_seq" START WITH 100001`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "orders_lines" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "orders_totals_vat" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "orders" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "withdrawals" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "orders_lines" CASCADE;
  DROP TABLE "orders_totals_vat" CASCADE;
  DROP TABLE "orders" CASCADE;
  DROP TABLE "withdrawals" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_orders_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_withdrawals_fk";
  
  DROP INDEX "payload_locked_documents_rels_orders_id_idx";
  DROP INDEX "payload_locked_documents_rels_withdrawals_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "orders_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "withdrawals_id";
  ALTER TABLE "settings" DROP COLUMN "orders_notification_email";
  DROP TYPE "public"."enum_orders_lines_price_unit";
  DROP TYPE "public"."enum_orders_lines_vat_rate";
  DROP TYPE "public"."enum_orders_status";
  DROP TYPE "public"."enum_orders_kind";
  DROP TYPE "public"."enum_orders_shipping_address_check_status";
  DROP TYPE "public"."enum_orders_delivery_method_type";
  DROP TYPE "public"."enum_orders_emails_customer_status";
  DROP TYPE "public"."enum_orders_emails_shop_status";
  DROP TYPE "public"."enum_withdrawals_status";
  DROP TYPE "public"."enum_withdrawals_confirmation_status";`)
  await db.execute(sql`DROP SEQUENCE IF EXISTS "order_number_seq"`)
}
