import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_products_variants_kind" AS ENUM('weight', 'piece');
  CREATE TYPE "public"."enum_products_variants_availability" AS ENUM('in-stock', 'in-transit', 'sold-out', 'hidden');
  CREATE TYPE "public"."enum_products_price_unit" AS ENUM('kg', '100g', 'piece');
  CREATE TYPE "public"."enum_products_vat_rate" AS ENUM('12', '21', '0');
  CREATE TYPE "public"."enum_products_feeding" AS ENUM('grain', 'grass');
  CREATE TYPE "public"."enum_products_availability" AS ENUM('in-stock', 'in-transit', 'sold-out', 'hidden');
  CREATE TYPE "public"."enum_products_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__products_v_version_variants_kind" AS ENUM('weight', 'piece');
  CREATE TYPE "public"."enum__products_v_version_variants_availability" AS ENUM('in-stock', 'in-transit', 'sold-out', 'hidden');
  CREATE TYPE "public"."enum__products_v_version_price_unit" AS ENUM('kg', '100g', 'piece');
  CREATE TYPE "public"."enum__products_v_version_vat_rate" AS ENUM('12', '21', '0');
  CREATE TYPE "public"."enum__products_v_version_feeding" AS ENUM('grain', 'grass');
  CREATE TYPE "public"."enum__products_v_version_availability" AS ENUM('in-stock', 'in-transit', 'sold-out', 'hidden');
  CREATE TYPE "public"."enum__products_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_categories_menu_column" AS ENUM('meat-type', 'cut', 'origin', 'standalone');
  CREATE TYPE "public"."enum_articles_section" AS ENUM('magazine', 'academy');
  CREATE TYPE "public"."enum_articles_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__articles_v_version_section" AS ENUM('magazine', 'academy');
  CREATE TYPE "public"."enum__articles_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_recipes_difficulty" AS ENUM('easy', 'medium', 'hard');
  CREATE TYPE "public"."enum_recipes_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__recipes_v_version_difficulty" AS ENUM('easy', 'medium', 'hard');
  CREATE TYPE "public"."enum__recipes_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_locations_kind" AS ENUM('shop', 'warehouse');
  CREATE TYPE "public"."enum_users_role" AS ENUM('admin', 'staff', 'butcher');
  CREATE TABLE "products_variants" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"kind" "enum_products_variants_kind" DEFAULT 'weight',
  	"weight_grams" numeric,
  	"availability" "enum_products_variants_availability",
  	"sort_order" numeric
  );
  
  CREATE TABLE "products" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"short_description" jsonb,
  	"description" jsonb,
  	"main_image_id" integer,
  	"price" numeric,
  	"price_unit" "enum_products_price_unit" DEFAULT 'kg',
  	"vat_rate" "enum_products_vat_rate" DEFAULT '12',
  	"meat_type_id" integer,
  	"cut_id" integer,
  	"origin_id" integer,
  	"shelf_life_id" integer,
  	"marbling" varchar,
  	"feeding" "enum_products_feeding",
  	"brand" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_image_id" integer,
  	"slug" varchar,
  	"availability" "enum_products_availability" DEFAULT 'in-stock',
  	"sku" varchar,
  	"legacy_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_products_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "products_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer,
  	"usages_id" integer,
  	"products_id" integer,
  	"recipes_id" integer,
  	"categories_id" integer
  );
  
  CREATE TABLE "_products_v_version_variants" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"kind" "enum__products_v_version_variants_kind" DEFAULT 'weight',
  	"weight_grams" numeric,
  	"availability" "enum__products_v_version_variants_availability",
  	"sort_order" numeric,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_products_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_short_description" jsonb,
  	"version_description" jsonb,
  	"version_main_image_id" integer,
  	"version_price" numeric,
  	"version_price_unit" "enum__products_v_version_price_unit" DEFAULT 'kg',
  	"version_vat_rate" "enum__products_v_version_vat_rate" DEFAULT '12',
  	"version_meat_type_id" integer,
  	"version_cut_id" integer,
  	"version_origin_id" integer,
  	"version_shelf_life_id" integer,
  	"version_marbling" varchar,
  	"version_feeding" "enum__products_v_version_feeding",
  	"version_brand" varchar,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_image_id" integer,
  	"version_slug" varchar,
  	"version_availability" "enum__products_v_version_availability" DEFAULT 'in-stock',
  	"version_sku" varchar,
  	"version_legacy_url" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__products_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_products_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer,
  	"usages_id" integer,
  	"products_id" integer,
  	"recipes_id" integer,
  	"categories_id" integer
  );
  
  CREATE TABLE "categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"image_id" integer,
  	"intro" jsonb,
  	"bottom_text" jsonb,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_image_id" integer,
  	"slug" varchar,
  	"parent_id" integer,
  	"menu_column" "enum_categories_menu_column",
  	"menu_order" numeric DEFAULT 100,
  	"legacy_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cuts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"alternative_name" varchar,
  	"description" varchar,
  	"image_id" integer,
  	"slug" varchar,
  	"sort_order" numeric DEFAULT 100,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "origins" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"adjective" varchar,
  	"description" varchar,
  	"image_id" integer,
  	"slug" varchar,
  	"sort_order" numeric DEFAULT 100,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "meat_types" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"image_id" integer,
  	"slug" varchar,
  	"sort_order" numeric DEFAULT 100,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "usages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"slug" varchar,
  	"sort_order" numeric DEFAULT 100,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "shelf_lives" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"slug" varchar,
  	"sort_order" numeric DEFAULT 100,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "articles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"perex" varchar,
  	"cover_image_id" integer,
  	"content" jsonb,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_image_id" integer,
  	"slug" varchar,
  	"section" "enum_articles_section" DEFAULT 'magazine',
  	"author_name" varchar,
  	"published_at" timestamp(3) with time zone,
  	"legacy_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_articles_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "articles_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"products_id" integer
  );
  
  CREATE TABLE "_articles_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_perex" varchar,
  	"version_cover_image_id" integer,
  	"version_content" jsonb,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_image_id" integer,
  	"version_slug" varchar,
  	"version_section" "enum__articles_v_version_section" DEFAULT 'magazine',
  	"version_author_name" varchar,
  	"version_published_at" timestamp(3) with time zone,
  	"version_legacy_url" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__articles_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_articles_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"products_id" integer
  );
  
  CREATE TABLE "recipes_ingredients" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"amount" varchar,
  	"unit" varchar,
  	"name" varchar
  );
  
  CREATE TABLE "recipes_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"image_id" integer
  );
  
  CREATE TABLE "recipes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"perex" varchar,
  	"cover_image_id" integer,
  	"prep_time_minutes" numeric,
  	"cook_time_minutes" numeric,
  	"servings" numeric,
  	"difficulty" "enum_recipes_difficulty",
  	"core_temperature_note" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_image_id" integer,
  	"slug" varchar,
  	"published_at" timestamp(3) with time zone,
  	"legacy_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_recipes_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "recipes_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"products_id" integer
  );
  
  CREATE TABLE "_recipes_v_version_ingredients" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"amount" varchar,
  	"unit" varchar,
  	"name" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_recipes_v_version_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"image_id" integer,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_recipes_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_perex" varchar,
  	"version_cover_image_id" integer,
  	"version_prep_time_minutes" numeric,
  	"version_cook_time_minutes" numeric,
  	"version_servings" numeric,
  	"version_difficulty" "enum__recipes_v_version_difficulty",
  	"version_core_temperature_note" varchar,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_image_id" integer,
  	"version_slug" varchar,
  	"version_published_at" timestamp(3) with time zone,
  	"version_legacy_url" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__recipes_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_recipes_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"products_id" integer
  );
  
  CREATE TABLE "pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"content" jsonb,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_image_id" integer,
  	"slug" varchar,
  	"legacy_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_pages_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_content" jsonb,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_image_id" integer,
  	"version_slug" varchar,
  	"version_legacy_url" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "locations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"kind" "enum_locations_kind" DEFAULT 'shop' NOT NULL,
  	"is_pickup_point" boolean DEFAULT true,
  	"address_street" varchar,
  	"address_city" varchar,
  	"address_zip" varchar,
  	"opening_hours_monday" varchar,
  	"opening_hours_tuesday" varchar,
  	"opening_hours_wednesday" varchar,
  	"opening_hours_thursday" varchar,
  	"opening_hours_friday" varchar,
  	"opening_hours_saturday" varchar,
  	"opening_hours_sunday" varchar,
  	"opening_hours_note" varchar,
  	"phone" varchar,
  	"email" varchar,
  	"map_url" varchar,
  	"parking_note" varchar,
  	"image_id" integer,
  	"slug" varchar,
  	"sort_order" numeric DEFAULT 100,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"delivery_price" numeric DEFAULT 229 NOT NULL,
  	"price_notice" varchar DEFAULT 'Cena je orientační. Každou objednávku řezník váží a výsledná cena se řídí skutečnou hmotností (obvykle se liší do ±15 %).' NOT NULL,
  	"contact_email" varchar,
  	"contact_phone" varchar,
  	"contact_whatsapp" varchar,
  	"company_name" varchar,
  	"company_ico" varchar,
  	"company_dic" varchar,
  	"company_address" varchar,
  	"company_registration" varchar,
  	"social_facebook" varchar,
  	"social_instagram" varchar,
  	"social_youtube" varchar,
  	"social_tiktok" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "users" ADD COLUMN "role" "enum_users_role" DEFAULT 'staff' NOT NULL;
  -- Hand-added: users created before roles existed had full access; keep them administrators.
  UPDATE "users" SET "role" = 'admin';
  ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_filename" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_card_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_card_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_card_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_card_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_card_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_card_filename" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_detail_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_detail_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_detail_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_detail_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_detail_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_detail_filename" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_og_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_og_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_og_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_og_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_og_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_og_filename" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "products_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "categories_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "cuts_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "origins_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "meat_types_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "usages_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "shelf_lives_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "articles_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "recipes_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "pages_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "locations_id" integer;
  ALTER TABLE "products_variants" ADD CONSTRAINT "products_variants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_main_image_id_media_id_fk" FOREIGN KEY ("main_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_meat_type_id_meat_types_id_fk" FOREIGN KEY ("meat_type_id") REFERENCES "public"."meat_types"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_cut_id_cuts_id_fk" FOREIGN KEY ("cut_id") REFERENCES "public"."cuts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_origin_id_origins_id_fk" FOREIGN KEY ("origin_id") REFERENCES "public"."origins"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_shelf_life_id_shelf_lives_id_fk" FOREIGN KEY ("shelf_life_id") REFERENCES "public"."shelf_lives"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_usages_fk" FOREIGN KEY ("usages_id") REFERENCES "public"."usages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_recipes_fk" FOREIGN KEY ("recipes_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_variants" ADD CONSTRAINT "_products_v_version_variants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_parent_id_products_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_version_main_image_id_media_id_fk" FOREIGN KEY ("version_main_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_version_meat_type_id_meat_types_id_fk" FOREIGN KEY ("version_meat_type_id") REFERENCES "public"."meat_types"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_version_cut_id_cuts_id_fk" FOREIGN KEY ("version_cut_id") REFERENCES "public"."cuts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_version_origin_id_origins_id_fk" FOREIGN KEY ("version_origin_id") REFERENCES "public"."origins"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_version_shelf_life_id_shelf_lives_id_fk" FOREIGN KEY ("version_shelf_life_id") REFERENCES "public"."shelf_lives"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_usages_fk" FOREIGN KEY ("usages_id") REFERENCES "public"."usages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_recipes_fk" FOREIGN KEY ("recipes_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cuts" ADD CONSTRAINT "cuts_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "origins" ADD CONSTRAINT "origins_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "meat_types" ADD CONSTRAINT "meat_types_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_cover_image_id_media_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_parent_id_articles_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_cover_image_id_media_id_fk" FOREIGN KEY ("version_cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "recipes_ingredients" ADD CONSTRAINT "recipes_ingredients_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "recipes_steps" ADD CONSTRAINT "recipes_steps_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "recipes_steps" ADD CONSTRAINT "recipes_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "recipes" ADD CONSTRAINT "recipes_cover_image_id_media_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "recipes" ADD CONSTRAINT "recipes_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "recipes_rels" ADD CONSTRAINT "recipes_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "recipes_rels" ADD CONSTRAINT "recipes_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_recipes_v_version_ingredients" ADD CONSTRAINT "_recipes_v_version_ingredients_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_recipes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_recipes_v_version_steps" ADD CONSTRAINT "_recipes_v_version_steps_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_recipes_v_version_steps" ADD CONSTRAINT "_recipes_v_version_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_recipes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_recipes_v" ADD CONSTRAINT "_recipes_v_parent_id_recipes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_recipes_v" ADD CONSTRAINT "_recipes_v_version_cover_image_id_media_id_fk" FOREIGN KEY ("version_cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_recipes_v" ADD CONSTRAINT "_recipes_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_recipes_v_rels" ADD CONSTRAINT "_recipes_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_recipes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_recipes_v_rels" ADD CONSTRAINT "_recipes_v_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "locations" ADD CONSTRAINT "locations_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "products_variants_order_idx" ON "products_variants" USING btree ("_order");
  CREATE INDEX "products_variants_parent_id_idx" ON "products_variants" USING btree ("_parent_id");
  CREATE INDEX "products_main_image_idx" ON "products" USING btree ("main_image_id");
  CREATE INDEX "products_meat_type_idx" ON "products" USING btree ("meat_type_id");
  CREATE INDEX "products_cut_idx" ON "products" USING btree ("cut_id");
  CREATE INDEX "products_origin_idx" ON "products" USING btree ("origin_id");
  CREATE INDEX "products_shelf_life_idx" ON "products" USING btree ("shelf_life_id");
  CREATE INDEX "products_seo_seo_image_idx" ON "products" USING btree ("seo_image_id");
  CREATE UNIQUE INDEX "products_slug_idx" ON "products" USING btree ("slug");
  CREATE INDEX "products_availability_idx" ON "products" USING btree ("availability");
  CREATE INDEX "products_sku_idx" ON "products" USING btree ("sku");
  CREATE INDEX "products_legacy_url_idx" ON "products" USING btree ("legacy_url");
  CREATE INDEX "products_updated_at_idx" ON "products" USING btree ("updated_at");
  CREATE INDEX "products_created_at_idx" ON "products" USING btree ("created_at");
  CREATE INDEX "products__status_idx" ON "products" USING btree ("_status");
  CREATE INDEX "products_rels_order_idx" ON "products_rels" USING btree ("order");
  CREATE INDEX "products_rels_parent_idx" ON "products_rels" USING btree ("parent_id");
  CREATE INDEX "products_rels_path_idx" ON "products_rels" USING btree ("path");
  CREATE INDEX "products_rels_media_id_idx" ON "products_rels" USING btree ("media_id");
  CREATE INDEX "products_rels_usages_id_idx" ON "products_rels" USING btree ("usages_id");
  CREATE INDEX "products_rels_products_id_idx" ON "products_rels" USING btree ("products_id");
  CREATE INDEX "products_rels_recipes_id_idx" ON "products_rels" USING btree ("recipes_id");
  CREATE INDEX "products_rels_categories_id_idx" ON "products_rels" USING btree ("categories_id");
  CREATE INDEX "_products_v_version_variants_order_idx" ON "_products_v_version_variants" USING btree ("_order");
  CREATE INDEX "_products_v_version_variants_parent_id_idx" ON "_products_v_version_variants" USING btree ("_parent_id");
  CREATE INDEX "_products_v_parent_idx" ON "_products_v" USING btree ("parent_id");
  CREATE INDEX "_products_v_version_version_main_image_idx" ON "_products_v" USING btree ("version_main_image_id");
  CREATE INDEX "_products_v_version_version_meat_type_idx" ON "_products_v" USING btree ("version_meat_type_id");
  CREATE INDEX "_products_v_version_version_cut_idx" ON "_products_v" USING btree ("version_cut_id");
  CREATE INDEX "_products_v_version_version_origin_idx" ON "_products_v" USING btree ("version_origin_id");
  CREATE INDEX "_products_v_version_version_shelf_life_idx" ON "_products_v" USING btree ("version_shelf_life_id");
  CREATE INDEX "_products_v_version_seo_version_seo_image_idx" ON "_products_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_products_v_version_version_slug_idx" ON "_products_v" USING btree ("version_slug");
  CREATE INDEX "_products_v_version_version_availability_idx" ON "_products_v" USING btree ("version_availability");
  CREATE INDEX "_products_v_version_version_sku_idx" ON "_products_v" USING btree ("version_sku");
  CREATE INDEX "_products_v_version_version_legacy_url_idx" ON "_products_v" USING btree ("version_legacy_url");
  CREATE INDEX "_products_v_version_version_updated_at_idx" ON "_products_v" USING btree ("version_updated_at");
  CREATE INDEX "_products_v_version_version_created_at_idx" ON "_products_v" USING btree ("version_created_at");
  CREATE INDEX "_products_v_version_version__status_idx" ON "_products_v" USING btree ("version__status");
  CREATE INDEX "_products_v_created_at_idx" ON "_products_v" USING btree ("created_at");
  CREATE INDEX "_products_v_updated_at_idx" ON "_products_v" USING btree ("updated_at");
  CREATE INDEX "_products_v_latest_idx" ON "_products_v" USING btree ("latest");
  CREATE INDEX "_products_v_rels_order_idx" ON "_products_v_rels" USING btree ("order");
  CREATE INDEX "_products_v_rels_parent_idx" ON "_products_v_rels" USING btree ("parent_id");
  CREATE INDEX "_products_v_rels_path_idx" ON "_products_v_rels" USING btree ("path");
  CREATE INDEX "_products_v_rels_media_id_idx" ON "_products_v_rels" USING btree ("media_id");
  CREATE INDEX "_products_v_rels_usages_id_idx" ON "_products_v_rels" USING btree ("usages_id");
  CREATE INDEX "_products_v_rels_products_id_idx" ON "_products_v_rels" USING btree ("products_id");
  CREATE INDEX "_products_v_rels_recipes_id_idx" ON "_products_v_rels" USING btree ("recipes_id");
  CREATE INDEX "_products_v_rels_categories_id_idx" ON "_products_v_rels" USING btree ("categories_id");
  CREATE INDEX "categories_image_idx" ON "categories" USING btree ("image_id");
  CREATE INDEX "categories_seo_seo_image_idx" ON "categories" USING btree ("seo_image_id");
  CREATE UNIQUE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");
  CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");
  CREATE INDEX "categories_legacy_url_idx" ON "categories" USING btree ("legacy_url");
  CREATE INDEX "categories_updated_at_idx" ON "categories" USING btree ("updated_at");
  CREATE INDEX "categories_created_at_idx" ON "categories" USING btree ("created_at");
  CREATE INDEX "cuts_image_idx" ON "cuts" USING btree ("image_id");
  CREATE UNIQUE INDEX "cuts_slug_idx" ON "cuts" USING btree ("slug");
  CREATE INDEX "cuts_updated_at_idx" ON "cuts" USING btree ("updated_at");
  CREATE INDEX "cuts_created_at_idx" ON "cuts" USING btree ("created_at");
  CREATE INDEX "origins_image_idx" ON "origins" USING btree ("image_id");
  CREATE UNIQUE INDEX "origins_slug_idx" ON "origins" USING btree ("slug");
  CREATE INDEX "origins_updated_at_idx" ON "origins" USING btree ("updated_at");
  CREATE INDEX "origins_created_at_idx" ON "origins" USING btree ("created_at");
  CREATE INDEX "meat_types_image_idx" ON "meat_types" USING btree ("image_id");
  CREATE UNIQUE INDEX "meat_types_slug_idx" ON "meat_types" USING btree ("slug");
  CREATE INDEX "meat_types_updated_at_idx" ON "meat_types" USING btree ("updated_at");
  CREATE INDEX "meat_types_created_at_idx" ON "meat_types" USING btree ("created_at");
  CREATE UNIQUE INDEX "usages_slug_idx" ON "usages" USING btree ("slug");
  CREATE INDEX "usages_updated_at_idx" ON "usages" USING btree ("updated_at");
  CREATE INDEX "usages_created_at_idx" ON "usages" USING btree ("created_at");
  CREATE UNIQUE INDEX "shelf_lives_slug_idx" ON "shelf_lives" USING btree ("slug");
  CREATE INDEX "shelf_lives_updated_at_idx" ON "shelf_lives" USING btree ("updated_at");
  CREATE INDEX "shelf_lives_created_at_idx" ON "shelf_lives" USING btree ("created_at");
  CREATE INDEX "articles_cover_image_idx" ON "articles" USING btree ("cover_image_id");
  CREATE INDEX "articles_seo_seo_image_idx" ON "articles" USING btree ("seo_image_id");
  CREATE UNIQUE INDEX "articles_slug_idx" ON "articles" USING btree ("slug");
  CREATE INDEX "articles_legacy_url_idx" ON "articles" USING btree ("legacy_url");
  CREATE INDEX "articles_updated_at_idx" ON "articles" USING btree ("updated_at");
  CREATE INDEX "articles_created_at_idx" ON "articles" USING btree ("created_at");
  CREATE INDEX "articles__status_idx" ON "articles" USING btree ("_status");
  CREATE INDEX "articles_rels_order_idx" ON "articles_rels" USING btree ("order");
  CREATE INDEX "articles_rels_parent_idx" ON "articles_rels" USING btree ("parent_id");
  CREATE INDEX "articles_rels_path_idx" ON "articles_rels" USING btree ("path");
  CREATE INDEX "articles_rels_products_id_idx" ON "articles_rels" USING btree ("products_id");
  CREATE INDEX "_articles_v_parent_idx" ON "_articles_v" USING btree ("parent_id");
  CREATE INDEX "_articles_v_version_version_cover_image_idx" ON "_articles_v" USING btree ("version_cover_image_id");
  CREATE INDEX "_articles_v_version_seo_version_seo_image_idx" ON "_articles_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_articles_v_version_version_slug_idx" ON "_articles_v" USING btree ("version_slug");
  CREATE INDEX "_articles_v_version_version_legacy_url_idx" ON "_articles_v" USING btree ("version_legacy_url");
  CREATE INDEX "_articles_v_version_version_updated_at_idx" ON "_articles_v" USING btree ("version_updated_at");
  CREATE INDEX "_articles_v_version_version_created_at_idx" ON "_articles_v" USING btree ("version_created_at");
  CREATE INDEX "_articles_v_version_version__status_idx" ON "_articles_v" USING btree ("version__status");
  CREATE INDEX "_articles_v_created_at_idx" ON "_articles_v" USING btree ("created_at");
  CREATE INDEX "_articles_v_updated_at_idx" ON "_articles_v" USING btree ("updated_at");
  CREATE INDEX "_articles_v_latest_idx" ON "_articles_v" USING btree ("latest");
  CREATE INDEX "_articles_v_rels_order_idx" ON "_articles_v_rels" USING btree ("order");
  CREATE INDEX "_articles_v_rels_parent_idx" ON "_articles_v_rels" USING btree ("parent_id");
  CREATE INDEX "_articles_v_rels_path_idx" ON "_articles_v_rels" USING btree ("path");
  CREATE INDEX "_articles_v_rels_products_id_idx" ON "_articles_v_rels" USING btree ("products_id");
  CREATE INDEX "recipes_ingredients_order_idx" ON "recipes_ingredients" USING btree ("_order");
  CREATE INDEX "recipes_ingredients_parent_id_idx" ON "recipes_ingredients" USING btree ("_parent_id");
  CREATE INDEX "recipes_steps_order_idx" ON "recipes_steps" USING btree ("_order");
  CREATE INDEX "recipes_steps_parent_id_idx" ON "recipes_steps" USING btree ("_parent_id");
  CREATE INDEX "recipes_steps_image_idx" ON "recipes_steps" USING btree ("image_id");
  CREATE INDEX "recipes_cover_image_idx" ON "recipes" USING btree ("cover_image_id");
  CREATE INDEX "recipes_seo_seo_image_idx" ON "recipes" USING btree ("seo_image_id");
  CREATE UNIQUE INDEX "recipes_slug_idx" ON "recipes" USING btree ("slug");
  CREATE INDEX "recipes_legacy_url_idx" ON "recipes" USING btree ("legacy_url");
  CREATE INDEX "recipes_updated_at_idx" ON "recipes" USING btree ("updated_at");
  CREATE INDEX "recipes_created_at_idx" ON "recipes" USING btree ("created_at");
  CREATE INDEX "recipes__status_idx" ON "recipes" USING btree ("_status");
  CREATE INDEX "recipes_rels_order_idx" ON "recipes_rels" USING btree ("order");
  CREATE INDEX "recipes_rels_parent_idx" ON "recipes_rels" USING btree ("parent_id");
  CREATE INDEX "recipes_rels_path_idx" ON "recipes_rels" USING btree ("path");
  CREATE INDEX "recipes_rels_products_id_idx" ON "recipes_rels" USING btree ("products_id");
  CREATE INDEX "_recipes_v_version_ingredients_order_idx" ON "_recipes_v_version_ingredients" USING btree ("_order");
  CREATE INDEX "_recipes_v_version_ingredients_parent_id_idx" ON "_recipes_v_version_ingredients" USING btree ("_parent_id");
  CREATE INDEX "_recipes_v_version_steps_order_idx" ON "_recipes_v_version_steps" USING btree ("_order");
  CREATE INDEX "_recipes_v_version_steps_parent_id_idx" ON "_recipes_v_version_steps" USING btree ("_parent_id");
  CREATE INDEX "_recipes_v_version_steps_image_idx" ON "_recipes_v_version_steps" USING btree ("image_id");
  CREATE INDEX "_recipes_v_parent_idx" ON "_recipes_v" USING btree ("parent_id");
  CREATE INDEX "_recipes_v_version_version_cover_image_idx" ON "_recipes_v" USING btree ("version_cover_image_id");
  CREATE INDEX "_recipes_v_version_seo_version_seo_image_idx" ON "_recipes_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_recipes_v_version_version_slug_idx" ON "_recipes_v" USING btree ("version_slug");
  CREATE INDEX "_recipes_v_version_version_legacy_url_idx" ON "_recipes_v" USING btree ("version_legacy_url");
  CREATE INDEX "_recipes_v_version_version_updated_at_idx" ON "_recipes_v" USING btree ("version_updated_at");
  CREATE INDEX "_recipes_v_version_version_created_at_idx" ON "_recipes_v" USING btree ("version_created_at");
  CREATE INDEX "_recipes_v_version_version__status_idx" ON "_recipes_v" USING btree ("version__status");
  CREATE INDEX "_recipes_v_created_at_idx" ON "_recipes_v" USING btree ("created_at");
  CREATE INDEX "_recipes_v_updated_at_idx" ON "_recipes_v" USING btree ("updated_at");
  CREATE INDEX "_recipes_v_latest_idx" ON "_recipes_v" USING btree ("latest");
  CREATE INDEX "_recipes_v_rels_order_idx" ON "_recipes_v_rels" USING btree ("order");
  CREATE INDEX "_recipes_v_rels_parent_idx" ON "_recipes_v_rels" USING btree ("parent_id");
  CREATE INDEX "_recipes_v_rels_path_idx" ON "_recipes_v_rels" USING btree ("path");
  CREATE INDEX "_recipes_v_rels_products_id_idx" ON "_recipes_v_rels" USING btree ("products_id");
  CREATE INDEX "pages_seo_seo_image_idx" ON "pages" USING btree ("seo_image_id");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
  CREATE INDEX "pages_legacy_url_idx" ON "pages" USING btree ("legacy_url");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE INDEX "pages__status_idx" ON "pages" USING btree ("_status");
  CREATE INDEX "_pages_v_parent_idx" ON "_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_seo_version_seo_image_idx" ON "_pages_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_version_legacy_url_idx" ON "_pages_v" USING btree ("version_legacy_url");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "_pages_v" USING btree ("version__status");
  CREATE INDEX "_pages_v_created_at_idx" ON "_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_latest_idx" ON "_pages_v" USING btree ("latest");
  CREATE INDEX "locations_image_idx" ON "locations" USING btree ("image_id");
  CREATE UNIQUE INDEX "locations_slug_idx" ON "locations" USING btree ("slug");
  CREATE INDEX "locations_updated_at_idx" ON "locations" USING btree ("updated_at");
  CREATE INDEX "locations_created_at_idx" ON "locations" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_cuts_fk" FOREIGN KEY ("cuts_id") REFERENCES "public"."cuts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_origins_fk" FOREIGN KEY ("origins_id") REFERENCES "public"."origins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_meat_types_fk" FOREIGN KEY ("meat_types_id") REFERENCES "public"."meat_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_usages_fk" FOREIGN KEY ("usages_id") REFERENCES "public"."usages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_shelf_lives_fk" FOREIGN KEY ("shelf_lives_id") REFERENCES "public"."shelf_lives"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_recipes_fk" FOREIGN KEY ("recipes_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_locations_fk" FOREIGN KEY ("locations_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE INDEX "media_sizes_detail_sizes_detail_filename_idx" ON "media" USING btree ("sizes_detail_filename");
  CREATE INDEX "media_sizes_og_sizes_og_filename_idx" ON "media" USING btree ("sizes_og_filename");
  CREATE INDEX "payload_locked_documents_rels_products_id_idx" ON "payload_locked_documents_rels" USING btree ("products_id");
  CREATE INDEX "payload_locked_documents_rels_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("categories_id");
  CREATE INDEX "payload_locked_documents_rels_cuts_id_idx" ON "payload_locked_documents_rels" USING btree ("cuts_id");
  CREATE INDEX "payload_locked_documents_rels_origins_id_idx" ON "payload_locked_documents_rels" USING btree ("origins_id");
  CREATE INDEX "payload_locked_documents_rels_meat_types_id_idx" ON "payload_locked_documents_rels" USING btree ("meat_types_id");
  CREATE INDEX "payload_locked_documents_rels_usages_id_idx" ON "payload_locked_documents_rels" USING btree ("usages_id");
  CREATE INDEX "payload_locked_documents_rels_shelf_lives_id_idx" ON "payload_locked_documents_rels" USING btree ("shelf_lives_id");
  CREATE INDEX "payload_locked_documents_rels_articles_id_idx" ON "payload_locked_documents_rels" USING btree ("articles_id");
  CREATE INDEX "payload_locked_documents_rels_recipes_id_idx" ON "payload_locked_documents_rels" USING btree ("recipes_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_locations_id_idx" ON "payload_locked_documents_rels" USING btree ("locations_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products_variants" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_products_v_version_variants" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_products_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_products_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "categories" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cuts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "origins" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "meat_types" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "usages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "shelf_lives" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "articles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "articles_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "recipes_ingredients" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "recipes_steps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "recipes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "recipes_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_recipes_v_version_ingredients" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_recipes_v_version_steps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_recipes_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_recipes_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "locations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "settings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "products_variants" CASCADE;
  DROP TABLE "products" CASCADE;
  DROP TABLE "products_rels" CASCADE;
  DROP TABLE "_products_v_version_variants" CASCADE;
  DROP TABLE "_products_v" CASCADE;
  DROP TABLE "_products_v_rels" CASCADE;
  DROP TABLE "categories" CASCADE;
  DROP TABLE "cuts" CASCADE;
  DROP TABLE "origins" CASCADE;
  DROP TABLE "meat_types" CASCADE;
  DROP TABLE "usages" CASCADE;
  DROP TABLE "shelf_lives" CASCADE;
  DROP TABLE "articles" CASCADE;
  DROP TABLE "articles_rels" CASCADE;
  DROP TABLE "_articles_v" CASCADE;
  DROP TABLE "_articles_v_rels" CASCADE;
  DROP TABLE "recipes_ingredients" CASCADE;
  DROP TABLE "recipes_steps" CASCADE;
  DROP TABLE "recipes" CASCADE;
  DROP TABLE "recipes_rels" CASCADE;
  DROP TABLE "_recipes_v_version_ingredients" CASCADE;
  DROP TABLE "_recipes_v_version_steps" CASCADE;
  DROP TABLE "_recipes_v" CASCADE;
  DROP TABLE "_recipes_v_rels" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "_pages_v" CASCADE;
  DROP TABLE "locations" CASCADE;
  DROP TABLE "settings" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_products_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_categories_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_cuts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_origins_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_meat_types_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_usages_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_shelf_lives_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_articles_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_recipes_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_pages_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_locations_fk";
  
  DROP INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx";
  DROP INDEX "media_sizes_card_sizes_card_filename_idx";
  DROP INDEX "media_sizes_detail_sizes_detail_filename_idx";
  DROP INDEX "media_sizes_og_sizes_og_filename_idx";
  DROP INDEX "payload_locked_documents_rels_products_id_idx";
  DROP INDEX "payload_locked_documents_rels_categories_id_idx";
  DROP INDEX "payload_locked_documents_rels_cuts_id_idx";
  DROP INDEX "payload_locked_documents_rels_origins_id_idx";
  DROP INDEX "payload_locked_documents_rels_meat_types_id_idx";
  DROP INDEX "payload_locked_documents_rels_usages_id_idx";
  DROP INDEX "payload_locked_documents_rels_shelf_lives_id_idx";
  DROP INDEX "payload_locked_documents_rels_articles_id_idx";
  DROP INDEX "payload_locked_documents_rels_recipes_id_idx";
  DROP INDEX "payload_locked_documents_rels_pages_id_idx";
  DROP INDEX "payload_locked_documents_rels_locations_id_idx";
  ALTER TABLE "media" DROP COLUMN "sizes_thumbnail_url";
  ALTER TABLE "media" DROP COLUMN "sizes_thumbnail_width";
  ALTER TABLE "media" DROP COLUMN "sizes_thumbnail_height";
  ALTER TABLE "media" DROP COLUMN "sizes_thumbnail_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_thumbnail_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_thumbnail_filename";
  ALTER TABLE "media" DROP COLUMN "sizes_card_url";
  ALTER TABLE "media" DROP COLUMN "sizes_card_width";
  ALTER TABLE "media" DROP COLUMN "sizes_card_height";
  ALTER TABLE "media" DROP COLUMN "sizes_card_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_card_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_card_filename";
  ALTER TABLE "media" DROP COLUMN "sizes_detail_url";
  ALTER TABLE "media" DROP COLUMN "sizes_detail_width";
  ALTER TABLE "media" DROP COLUMN "sizes_detail_height";
  ALTER TABLE "media" DROP COLUMN "sizes_detail_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_detail_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_detail_filename";
  ALTER TABLE "media" DROP COLUMN "sizes_og_url";
  ALTER TABLE "media" DROP COLUMN "sizes_og_width";
  ALTER TABLE "media" DROP COLUMN "sizes_og_height";
  ALTER TABLE "media" DROP COLUMN "sizes_og_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_og_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_og_filename";
  ALTER TABLE "users" DROP COLUMN "role";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "products_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "categories_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "cuts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "origins_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "meat_types_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "usages_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "shelf_lives_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "articles_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "recipes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "pages_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "locations_id";
  DROP TYPE "public"."enum_products_variants_kind";
  DROP TYPE "public"."enum_products_variants_availability";
  DROP TYPE "public"."enum_products_price_unit";
  DROP TYPE "public"."enum_products_vat_rate";
  DROP TYPE "public"."enum_products_feeding";
  DROP TYPE "public"."enum_products_availability";
  DROP TYPE "public"."enum_products_status";
  DROP TYPE "public"."enum__products_v_version_variants_kind";
  DROP TYPE "public"."enum__products_v_version_variants_availability";
  DROP TYPE "public"."enum__products_v_version_price_unit";
  DROP TYPE "public"."enum__products_v_version_vat_rate";
  DROP TYPE "public"."enum__products_v_version_feeding";
  DROP TYPE "public"."enum__products_v_version_availability";
  DROP TYPE "public"."enum__products_v_version_status";
  DROP TYPE "public"."enum_categories_menu_column";
  DROP TYPE "public"."enum_articles_section";
  DROP TYPE "public"."enum_articles_status";
  DROP TYPE "public"."enum__articles_v_version_section";
  DROP TYPE "public"."enum__articles_v_version_status";
  DROP TYPE "public"."enum_recipes_difficulty";
  DROP TYPE "public"."enum_recipes_status";
  DROP TYPE "public"."enum__recipes_v_version_difficulty";
  DROP TYPE "public"."enum__recipes_v_version_status";
  DROP TYPE "public"."enum_pages_status";
  DROP TYPE "public"."enum__pages_v_version_status";
  DROP TYPE "public"."enum_locations_kind";
  DROP TYPE "public"."enum_users_role";`)
}
