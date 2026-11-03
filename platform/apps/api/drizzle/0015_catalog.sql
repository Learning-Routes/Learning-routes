-- Whether the acting user is the platform's operator (Platform STEP 4 §2.5). Security
-- definer, like app.member_space_ids, so a policy need not read platform_roles itself.
create function app.is_operator() returns boolean
  language sql stable security definer
  set search_path = pg_catalog, public
  return coalesce(
    (select role.is_operator from public.platform_roles as role where role.user_id = app.user_id()),
    false
  );
--> statement-breakpoint
revoke execute on function app.is_operator() from public;
--> statement-breakpoint
CREATE TABLE "catalog_listings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"route_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"decided_version" integer,
	"featured_position" smallint,
	CONSTRAINT "catalog_listings_status" CHECK ("catalog_listings"."status" in ('requested', 'approved', 'declined', 'withdrawn')),
	CONSTRAINT "catalog_listings_featured_position" CHECK ("catalog_listings"."featured_position" is null or ("catalog_listings"."featured_position" between 1 and 3 and "catalog_listings"."status" = 'approved'))
);
--> statement-breakpoint
CREATE TABLE "creator_applications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"teaches" text NOT NULL,
	"link" text,
	"locale" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "creator_applications_status" CHECK ("creator_applications"."status" in ('new', 'invited', 'declined')),
	CONSTRAINT "creator_applications_locale" CHECK (app.is_locale_list(array["creator_applications"."locale"]))
);
--> statement-breakpoint
-- No reader breaks: every read of the log names a space, and a null one matches none.
-- squawk-ignore ban-drop-not-null
ALTER TABLE "action_log" ALTER COLUMN "space_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "topic" text DEFAULT 'otros' NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "level" text DEFAULT 'inicial' NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "price_minor" bigint;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "tagline" jsonb;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "bio" jsonb;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "brand_color" text;--> statement-breakpoint
ALTER TABLE "catalog_listings" ADD CONSTRAINT "catalog_listings_route_id_fkey" FOREIGN KEY ("route_id","space_id") REFERENCES "public"."routes"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_listings_active_route_id_key" ON "catalog_listings" USING btree ("route_id") WHERE "catalog_listings"."status" in ('requested', 'approved');--> statement-breakpoint
CREATE INDEX "catalog_listings_status_idx" ON "catalog_listings" USING btree ("status","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_listings_featured_position_key" ON "catalog_listings" USING btree ("featured_position") WHERE "catalog_listings"."featured_position" is not null;--> statement-breakpoint
CREATE INDEX "creator_applications_status_idx" ON "creator_applications" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "creator_applications_lower_email_idx" ON "creator_applications" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_topic" CHECK ("routes"."topic" in ('idiomas', 'matematicas', 'programacion', 'ciencias', 'musica', 'negocios', 'arte', 'otros')) NOT VALID;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_level" CHECK ("routes"."level" in ('inicial', 'intermedio', 'avanzado')) NOT VALID;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_price" CHECK (("routes"."price_minor" is null and "routes"."currency" is null) or ("routes"."price_minor" >= 0 and "routes"."currency" ~ '^[A-Z]{3}$')) NOT VALID;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_tagline_localized" CHECK (app.is_localized("spaces"."tagline")) NOT VALID;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_bio_localized" CHECK (app.is_localized("spaces"."bio")) NOT VALID;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_brand_color" CHECK ("spaces"."brand_color" ~ '^#[0-9a-f]{6}$') NOT VALID;