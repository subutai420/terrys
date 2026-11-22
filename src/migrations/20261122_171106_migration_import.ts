import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products" ADD COLUMN "migration_locked" boolean DEFAULT false;
  ALTER TABLE "products" ADD COLUMN "migration_imported_at" timestamp(3) with time zone;
  ALTER TABLE "products" ADD COLUMN "migration_source_hash" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_migration_locked" boolean DEFAULT false;
  ALTER TABLE "_products_v" ADD COLUMN "version_migration_imported_at" timestamp(3) with time zone;
  ALTER TABLE "_products_v" ADD COLUMN "version_migration_source_hash" varchar;
  ALTER TABLE "categories" ADD COLUMN "migration_locked" boolean DEFAULT false;
  ALTER TABLE "categories" ADD COLUMN "migration_imported_at" timestamp(3) with time zone;
  ALTER TABLE "categories" ADD COLUMN "migration_source_hash" varchar;
  ALTER TABLE "articles" ADD COLUMN "migration_locked" boolean DEFAULT false;
  ALTER TABLE "articles" ADD COLUMN "migration_imported_at" timestamp(3) with time zone;
  ALTER TABLE "articles" ADD COLUMN "migration_source_hash" varchar;
  ALTER TABLE "_articles_v" ADD COLUMN "version_migration_locked" boolean DEFAULT false;
  ALTER TABLE "_articles_v" ADD COLUMN "version_migration_imported_at" timestamp(3) with time zone;
  ALTER TABLE "_articles_v" ADD COLUMN "version_migration_source_hash" varchar;
  ALTER TABLE "recipes" ADD COLUMN "content" jsonb;
  ALTER TABLE "recipes" ADD COLUMN "migration_locked" boolean DEFAULT false;
  ALTER TABLE "recipes" ADD COLUMN "migration_imported_at" timestamp(3) with time zone;
  ALTER TABLE "recipes" ADD COLUMN "migration_source_hash" varchar;
  ALTER TABLE "_recipes_v" ADD COLUMN "version_content" jsonb;
  ALTER TABLE "_recipes_v" ADD COLUMN "version_migration_locked" boolean DEFAULT false;
  ALTER TABLE "_recipes_v" ADD COLUMN "version_migration_imported_at" timestamp(3) with time zone;
  ALTER TABLE "_recipes_v" ADD COLUMN "version_migration_source_hash" varchar;
  ALTER TABLE "pages" ADD COLUMN "migration_locked" boolean DEFAULT false;
  ALTER TABLE "pages" ADD COLUMN "migration_imported_at" timestamp(3) with time zone;
  ALTER TABLE "pages" ADD COLUMN "migration_source_hash" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_migration_locked" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN "version_migration_imported_at" timestamp(3) with time zone;
  ALTER TABLE "_pages_v" ADD COLUMN "version_migration_source_hash" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products" DROP COLUMN "migration_locked";
  ALTER TABLE "products" DROP COLUMN "migration_imported_at";
  ALTER TABLE "products" DROP COLUMN "migration_source_hash";
  ALTER TABLE "_products_v" DROP COLUMN "version_migration_locked";
  ALTER TABLE "_products_v" DROP COLUMN "version_migration_imported_at";
  ALTER TABLE "_products_v" DROP COLUMN "version_migration_source_hash";
  ALTER TABLE "categories" DROP COLUMN "migration_locked";
  ALTER TABLE "categories" DROP COLUMN "migration_imported_at";
  ALTER TABLE "categories" DROP COLUMN "migration_source_hash";
  ALTER TABLE "articles" DROP COLUMN "migration_locked";
  ALTER TABLE "articles" DROP COLUMN "migration_imported_at";
  ALTER TABLE "articles" DROP COLUMN "migration_source_hash";
  ALTER TABLE "_articles_v" DROP COLUMN "version_migration_locked";
  ALTER TABLE "_articles_v" DROP COLUMN "version_migration_imported_at";
  ALTER TABLE "_articles_v" DROP COLUMN "version_migration_source_hash";
  ALTER TABLE "recipes" DROP COLUMN "content";
  ALTER TABLE "recipes" DROP COLUMN "migration_locked";
  ALTER TABLE "recipes" DROP COLUMN "migration_imported_at";
  ALTER TABLE "recipes" DROP COLUMN "migration_source_hash";
  ALTER TABLE "_recipes_v" DROP COLUMN "version_content";
  ALTER TABLE "_recipes_v" DROP COLUMN "version_migration_locked";
  ALTER TABLE "_recipes_v" DROP COLUMN "version_migration_imported_at";
  ALTER TABLE "_recipes_v" DROP COLUMN "version_migration_source_hash";
  ALTER TABLE "pages" DROP COLUMN "migration_locked";
  ALTER TABLE "pages" DROP COLUMN "migration_imported_at";
  ALTER TABLE "pages" DROP COLUMN "migration_source_hash";
  ALTER TABLE "_pages_v" DROP COLUMN "version_migration_locked";
  ALTER TABLE "_pages_v" DROP COLUMN "version_migration_imported_at";
  ALTER TABLE "_pages_v" DROP COLUMN "version_migration_source_hash";`)
}
