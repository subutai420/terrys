import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_orders_privacy_anonymised_reason" AS ENUM('request', 'retention');
  ALTER TABLE "orders" ADD COLUMN "privacy_anonymised_at" timestamp(3) with time zone;
  ALTER TABLE "orders" ADD COLUMN "privacy_anonymised_reason" "enum_orders_privacy_anonymised_reason";
  ALTER TABLE "orders" ADD COLUMN "privacy_anonymised_by_id" integer;
  ALTER TABLE "withdrawals" ADD COLUMN "anonymised_at" timestamp(3) with time zone;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_privacy_anonymised_by_id_users_id_fk" FOREIGN KEY ("privacy_anonymised_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "orders_privacy_privacy_anonymised_at_idx" ON "orders" USING btree ("privacy_anonymised_at");
  CREATE INDEX "orders_privacy_privacy_anonymised_by_idx" ON "orders" USING btree ("privacy_anonymised_by_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "orders" DROP CONSTRAINT "orders_privacy_anonymised_by_id_users_id_fk";
  
  DROP INDEX "orders_privacy_privacy_anonymised_at_idx";
  DROP INDEX "orders_privacy_privacy_anonymised_by_idx";
  ALTER TABLE "orders" DROP COLUMN "privacy_anonymised_at";
  ALTER TABLE "orders" DROP COLUMN "privacy_anonymised_reason";
  ALTER TABLE "orders" DROP COLUMN "privacy_anonymised_by_id";
  ALTER TABLE "withdrawals" DROP COLUMN "anonymised_at";
  DROP TYPE "public"."enum_orders_privacy_anonymised_reason";`)
}
