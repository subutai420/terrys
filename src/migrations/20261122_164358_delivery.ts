import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_shipping_methods_weekdays" AS ENUM('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');
  CREATE TYPE "public"."enum_shipping_methods_type" AS ENUM('own-delivery', 'courier', 'pickup');
  CREATE TYPE "public"."enum_shipping_methods_coverage" AS ENUM('zones', 'everywhere', 'fallback');
  CREATE TYPE "public"."enum_delivery_zones_weekdays" AS ENUM('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');
  CREATE TYPE "public"."enum_delivery_exceptions_kind" AS ENUM('closed', 'open');
  CREATE TYPE "public"."enum_delivery_exceptions_scope" AS ENUM('all', 'method', 'location');
  CREATE TABLE "shipping_methods_weekdays" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_shipping_methods_weekdays",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "shipping_methods" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"type" "enum_shipping_methods_type" NOT NULL,
  	"customer_note" varchar,
  	"cutoff_time" varchar DEFAULT '12:00' NOT NULL,
  	"lead_days" numeric DEFAULT 1 NOT NULL,
  	"coverage" "enum_shipping_methods_coverage" DEFAULT 'zones',
  	"location_id" integer,
  	"balikobot_carrier_code" varchar,
  	"balikobot_service_code" varchar,
  	"active" boolean DEFAULT true,
  	"internal_note" varchar,
  	"slug" varchar,
  	"sort_order" numeric DEFAULT 100,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "delivery_zones_weekdays" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_delivery_zones_weekdays",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "delivery_zones" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"method_id" integer NOT NULL,
  	"postcodes" varchar NOT NULL,
  	"note" varchar,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "delivery_exceptions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"date_from" timestamp(3) with time zone NOT NULL,
  	"date_to" timestamp(3) with time zone,
  	"reason" varchar NOT NULL,
  	"kind" "enum_delivery_exceptions_kind" DEFAULT 'closed' NOT NULL,
  	"scope" "enum_delivery_exceptions_scope" DEFAULT 'all' NOT NULL,
  	"method_id" integer,
  	"location_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "postcodes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"city" varchar,
  	"district" varchar,
  	"delivery_blocked" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "shipping_methods_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "delivery_zones_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "delivery_exceptions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "postcodes_id" integer;
  ALTER TABLE "settings" ADD COLUMN "delivery_horizon_days" numeric DEFAULT 21 NOT NULL;
  ALTER TABLE "shipping_methods_weekdays" ADD CONSTRAINT "shipping_methods_weekdays_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."shipping_methods"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "shipping_methods" ADD CONSTRAINT "shipping_methods_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_zones_weekdays" ADD CONSTRAINT "delivery_zones_weekdays_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."delivery_zones"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_method_id_shipping_methods_id_fk" FOREIGN KEY ("method_id") REFERENCES "public"."shipping_methods"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_exceptions" ADD CONSTRAINT "delivery_exceptions_method_id_shipping_methods_id_fk" FOREIGN KEY ("method_id") REFERENCES "public"."shipping_methods"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_exceptions" ADD CONSTRAINT "delivery_exceptions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "shipping_methods_weekdays_order_idx" ON "shipping_methods_weekdays" USING btree ("order");
  CREATE INDEX "shipping_methods_weekdays_parent_idx" ON "shipping_methods_weekdays" USING btree ("parent_id");
  CREATE INDEX "shipping_methods_location_idx" ON "shipping_methods" USING btree ("location_id");
  CREATE UNIQUE INDEX "shipping_methods_slug_idx" ON "shipping_methods" USING btree ("slug");
  CREATE INDEX "shipping_methods_updated_at_idx" ON "shipping_methods" USING btree ("updated_at");
  CREATE INDEX "shipping_methods_created_at_idx" ON "shipping_methods" USING btree ("created_at");
  CREATE INDEX "delivery_zones_weekdays_order_idx" ON "delivery_zones_weekdays" USING btree ("order");
  CREATE INDEX "delivery_zones_weekdays_parent_idx" ON "delivery_zones_weekdays" USING btree ("parent_id");
  CREATE INDEX "delivery_zones_method_idx" ON "delivery_zones" USING btree ("method_id");
  CREATE INDEX "delivery_zones_updated_at_idx" ON "delivery_zones" USING btree ("updated_at");
  CREATE INDEX "delivery_zones_created_at_idx" ON "delivery_zones" USING btree ("created_at");
  CREATE INDEX "delivery_exceptions_date_from_idx" ON "delivery_exceptions" USING btree ("date_from");
  CREATE INDEX "delivery_exceptions_date_to_idx" ON "delivery_exceptions" USING btree ("date_to");
  CREATE INDEX "delivery_exceptions_method_idx" ON "delivery_exceptions" USING btree ("method_id");
  CREATE INDEX "delivery_exceptions_location_idx" ON "delivery_exceptions" USING btree ("location_id");
  CREATE INDEX "delivery_exceptions_updated_at_idx" ON "delivery_exceptions" USING btree ("updated_at");
  CREATE INDEX "delivery_exceptions_created_at_idx" ON "delivery_exceptions" USING btree ("created_at");
  CREATE UNIQUE INDEX "postcodes_code_idx" ON "postcodes" USING btree ("code");
  CREATE INDEX "postcodes_delivery_blocked_idx" ON "postcodes" USING btree ("delivery_blocked");
  CREATE INDEX "postcodes_updated_at_idx" ON "postcodes" USING btree ("updated_at");
  CREATE INDEX "postcodes_created_at_idx" ON "postcodes" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_shipping_methods_fk" FOREIGN KEY ("shipping_methods_id") REFERENCES "public"."shipping_methods"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_delivery_zones_fk" FOREIGN KEY ("delivery_zones_id") REFERENCES "public"."delivery_zones"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_delivery_exceptions_fk" FOREIGN KEY ("delivery_exceptions_id") REFERENCES "public"."delivery_exceptions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_postcodes_fk" FOREIGN KEY ("postcodes_id") REFERENCES "public"."postcodes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_shipping_methods_id_idx" ON "payload_locked_documents_rels" USING btree ("shipping_methods_id");
  CREATE INDEX "payload_locked_documents_rels_delivery_zones_id_idx" ON "payload_locked_documents_rels" USING btree ("delivery_zones_id");
  CREATE INDEX "payload_locked_documents_rels_delivery_exceptions_id_idx" ON "payload_locked_documents_rels" USING btree ("delivery_exceptions_id");
  CREATE INDEX "payload_locked_documents_rels_postcodes_id_idx" ON "payload_locked_documents_rels" USING btree ("postcodes_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "shipping_methods_weekdays" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "shipping_methods" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "delivery_zones_weekdays" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "delivery_zones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "delivery_exceptions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "postcodes" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "shipping_methods_weekdays" CASCADE;
  DROP TABLE "shipping_methods" CASCADE;
  DROP TABLE "delivery_zones_weekdays" CASCADE;
  DROP TABLE "delivery_zones" CASCADE;
  DROP TABLE "delivery_exceptions" CASCADE;
  DROP TABLE "postcodes" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_shipping_methods_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_delivery_zones_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_delivery_exceptions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_postcodes_fk";
  
  DROP INDEX "payload_locked_documents_rels_shipping_methods_id_idx";
  DROP INDEX "payload_locked_documents_rels_delivery_zones_id_idx";
  DROP INDEX "payload_locked_documents_rels_delivery_exceptions_id_idx";
  DROP INDEX "payload_locked_documents_rels_postcodes_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "shipping_methods_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "delivery_zones_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "delivery_exceptions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "postcodes_id";
  ALTER TABLE "settings" DROP COLUMN "delivery_horizon_days";
  DROP TYPE "public"."enum_shipping_methods_weekdays";
  DROP TYPE "public"."enum_shipping_methods_type";
  DROP TYPE "public"."enum_shipping_methods_coverage";
  DROP TYPE "public"."enum_delivery_zones_weekdays";
  DROP TYPE "public"."enum_delivery_exceptions_kind";
  DROP TYPE "public"."enum_delivery_exceptions_scope";`)
}
