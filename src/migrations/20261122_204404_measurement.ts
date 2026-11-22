import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_orders_integrations_meta_status" AS ENUM('pending', 'sent', 'failed', 'skipped', 'disabled');
  CREATE TYPE "public"."enum_orders_integrations_heureka_status" AS ENUM('pending', 'sent', 'failed', 'skipped', 'disabled');
  CREATE TYPE "public"."enum_orders_integrations_ecomail_status" AS ENUM('pending', 'sent', 'failed', 'skipped', 'disabled');
  CREATE TYPE "public"."enum_integration_jobs_kind" AS ENUM('meta-capi-purchase', 'heureka-order', 'ecomail-subscribe');
  CREATE TYPE "public"."enum_integration_jobs_status" AS ENUM('pending', 'processing', 'sent', 'failed', 'skipped', 'expired');
  CREATE TABLE "integration_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"kind" "enum_integration_jobs_kind" NOT NULL,
  	"status" "enum_integration_jobs_status" DEFAULT 'pending' NOT NULL,
  	"attempts" numeric DEFAULT 0,
  	"order_id" integer,
  	"next_attempt_at" timestamp(3) with time zone,
  	"sent_at" timestamp(3) with time zone,
  	"locked_until" timestamp(3) with time zone,
  	"last_error" varchar,
  	"payload" jsonb,
  	"response" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "marketing" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"consent_version" varchar DEFAULT '2026-11' NOT NULL,
  	"feed_defaults_google_product_category" varchar DEFAULT '4628',
  	"feed_defaults_heureka_category" varchar DEFAULT 'Heureka.cz | Jídlo a nápoje | Čerstvé potraviny | Maso, drůbež, ryby',
  	"feed_defaults_zbozi_category" varchar DEFAULT 'Potraviny a nápoje | Potraviny | Maso a ryby',
  	"feed_defaults_in_stock_delivery_days" numeric DEFAULT 0,
  	"feed_defaults_in_transit_delivery_days" numeric DEFAULT 7,
  	"feed_stats" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "orders" ADD COLUMN "integrations_meta_status" "enum_orders_integrations_meta_status";
  ALTER TABLE "orders" ADD COLUMN "integrations_meta_at" timestamp(3) with time zone;
  ALTER TABLE "orders" ADD COLUMN "integrations_meta_note" varchar;
  ALTER TABLE "orders" ADD COLUMN "integrations_heureka_status" "enum_orders_integrations_heureka_status";
  ALTER TABLE "orders" ADD COLUMN "integrations_heureka_at" timestamp(3) with time zone;
  ALTER TABLE "orders" ADD COLUMN "integrations_heureka_note" varchar;
  ALTER TABLE "orders" ADD COLUMN "integrations_ecomail_status" "enum_orders_integrations_ecomail_status";
  ALTER TABLE "orders" ADD COLUMN "integrations_ecomail_at" timestamp(3) with time zone;
  ALTER TABLE "orders" ADD COLUMN "integrations_ecomail_note" varchar;
  ALTER TABLE "products" ADD COLUMN "feeds_exclude" boolean;
  ALTER TABLE "_products_v" ADD COLUMN "version_feeds_exclude" boolean;
  ALTER TABLE "categories" ADD COLUMN "feeds_exclude" boolean;
  ALTER TABLE "categories" ADD COLUMN "feeds_google_product_category" varchar;
  ALTER TABLE "categories" ADD COLUMN "feeds_heureka_category" varchar;
  ALTER TABLE "categories" ADD COLUMN "feeds_zbozi_category" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "integration_jobs_id" integer;
  ALTER TABLE "integration_jobs" ADD CONSTRAINT "integration_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "integration_jobs_kind_idx" ON "integration_jobs" USING btree ("kind");
  CREATE INDEX "integration_jobs_status_idx" ON "integration_jobs" USING btree ("status");
  CREATE INDEX "integration_jobs_order_idx" ON "integration_jobs" USING btree ("order_id");
  CREATE INDEX "integration_jobs_next_attempt_at_idx" ON "integration_jobs" USING btree ("next_attempt_at");
  CREATE INDEX "integration_jobs_updated_at_idx" ON "integration_jobs" USING btree ("updated_at");
  CREATE INDEX "integration_jobs_created_at_idx" ON "integration_jobs" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_integration_jobs_fk" FOREIGN KEY ("integration_jobs_id") REFERENCES "public"."integration_jobs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_integration_jobs_id_idx" ON "payload_locked_documents_rels" USING btree ("integration_jobs_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "integration_jobs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "marketing" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "integration_jobs" CASCADE;
  DROP TABLE "marketing" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_integration_jobs_fk";
  
  DROP INDEX "payload_locked_documents_rels_integration_jobs_id_idx";
  ALTER TABLE "orders" DROP COLUMN "integrations_meta_status";
  ALTER TABLE "orders" DROP COLUMN "integrations_meta_at";
  ALTER TABLE "orders" DROP COLUMN "integrations_meta_note";
  ALTER TABLE "orders" DROP COLUMN "integrations_heureka_status";
  ALTER TABLE "orders" DROP COLUMN "integrations_heureka_at";
  ALTER TABLE "orders" DROP COLUMN "integrations_heureka_note";
  ALTER TABLE "orders" DROP COLUMN "integrations_ecomail_status";
  ALTER TABLE "orders" DROP COLUMN "integrations_ecomail_at";
  ALTER TABLE "orders" DROP COLUMN "integrations_ecomail_note";
  ALTER TABLE "products" DROP COLUMN "feeds_exclude";
  ALTER TABLE "_products_v" DROP COLUMN "version_feeds_exclude";
  ALTER TABLE "categories" DROP COLUMN "feeds_exclude";
  ALTER TABLE "categories" DROP COLUMN "feeds_google_product_category";
  ALTER TABLE "categories" DROP COLUMN "feeds_heureka_category";
  ALTER TABLE "categories" DROP COLUMN "feeds_zbozi_category";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "integration_jobs_id";
  DROP TYPE "public"."enum_orders_integrations_meta_status";
  DROP TYPE "public"."enum_orders_integrations_heureka_status";
  DROP TYPE "public"."enum_orders_integrations_ecomail_status";
  DROP TYPE "public"."enum_integration_jobs_kind";
  DROP TYPE "public"."enum_integration_jobs_status";`)
}
