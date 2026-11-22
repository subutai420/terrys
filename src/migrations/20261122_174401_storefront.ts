import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "homepage_trust_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "homepage" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"hero_heading" varchar DEFAULT 'Steaky z celého světa, naporcované řezníkem',
  	"hero_text" varchar DEFAULT 'Argentina, Uruguay, USA, Austrálie i japonské wagyu. Vybíráme celé kusy, porcujeme je u nás a vozíme vlastním chlazeným rozvozem až k vám domů.',
  	"hero_image_id" integer,
  	"hero_primary_label" varchar DEFAULT 'Vybrat steak',
  	"hero_primary_url" varchar DEFAULT '/produkty',
  	"hero_secondary_label" varchar,
  	"hero_secondary_url" varchar,
  	"featured_categories_heading" varchar DEFAULT 'Naše nejoblíbenější steaky',
  	"featured_categories_subheading" varchar DEFAULT 'Řezy, které si zákazníci objednávají nejčastěji',
  	"origins_heading" varchar DEFAULT 'Steaky ze všech koutů světa',
  	"other_categories_heading" varchar DEFAULT 'Další maso a dárky',
  	"featured_products_heading" varchar DEFAULT 'Doporučujeme',
  	"story_heading" varchar,
  	"story_text" varchar,
  	"story_image_id" integer,
  	"story_link_label" varchar,
  	"story_link_url" varchar,
  	"magazine_heading" varchar DEFAULT 'Z našeho magazínu',
  	"magazine_subheading" varchar DEFAULT 'Řezy, plemena a postupy od našich řezníků',
  	"magazine_recipes_heading" varchar DEFAULT 'Co dnes uvařit',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "homepage_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"categories_id" integer,
  	"origins_id" integer,
  	"products_id" integer
  );
  
  ALTER TABLE "origins" ADD COLUMN "category_id" integer;
  ALTER TABLE "locations" ADD COLUMN "page_id" integer;
  ALTER TABLE "homepage_trust_items" ADD CONSTRAINT "homepage_trust_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_hero_image_id_media_id_fk" FOREIGN KEY ("hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_story_image_id_media_id_fk" FOREIGN KEY ("story_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage_rels" ADD CONSTRAINT "homepage_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_rels" ADD CONSTRAINT "homepage_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_rels" ADD CONSTRAINT "homepage_rels_origins_fk" FOREIGN KEY ("origins_id") REFERENCES "public"."origins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_rels" ADD CONSTRAINT "homepage_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "homepage_trust_items_order_idx" ON "homepage_trust_items" USING btree ("_order");
  CREATE INDEX "homepage_trust_items_parent_id_idx" ON "homepage_trust_items" USING btree ("_parent_id");
  CREATE INDEX "homepage_hero_hero_image_idx" ON "homepage" USING btree ("hero_image_id");
  CREATE INDEX "homepage_story_story_image_idx" ON "homepage" USING btree ("story_image_id");
  CREATE INDEX "homepage_rels_order_idx" ON "homepage_rels" USING btree ("order");
  CREATE INDEX "homepage_rels_parent_idx" ON "homepage_rels" USING btree ("parent_id");
  CREATE INDEX "homepage_rels_path_idx" ON "homepage_rels" USING btree ("path");
  CREATE INDEX "homepage_rels_categories_id_idx" ON "homepage_rels" USING btree ("categories_id");
  CREATE INDEX "homepage_rels_origins_id_idx" ON "homepage_rels" USING btree ("origins_id");
  CREATE INDEX "homepage_rels_products_id_idx" ON "homepage_rels" USING btree ("products_id");
  ALTER TABLE "origins" ADD CONSTRAINT "origins_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "locations" ADD CONSTRAINT "locations_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "origins_category_idx" ON "origins" USING btree ("category_id");
  CREATE INDEX "locations_page_idx" ON "locations" USING btree ("page_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "homepage_trust_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "homepage" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "homepage_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "homepage_trust_items" CASCADE;
  DROP TABLE "homepage" CASCADE;
  DROP TABLE "homepage_rels" CASCADE;
  ALTER TABLE "origins" DROP CONSTRAINT "origins_category_id_categories_id_fk";
  
  ALTER TABLE "locations" DROP CONSTRAINT "locations_page_id_pages_id_fk";
  
  DROP INDEX "origins_category_idx";
  DROP INDEX "locations_page_idx";
  ALTER TABLE "origins" DROP COLUMN "category_id";
  ALTER TABLE "locations" DROP COLUMN "page_id";`)
}
