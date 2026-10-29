CREATE TABLE "memberships" (
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_space_id_user_id_pk" PRIMARY KEY("space_id","user_id"),
	CONSTRAINT "memberships_role" CHECK ("memberships"."role" in ('owner', 'coeditor', 'assistant', 'student'))
);
--> statement-breakpoint
CREATE TABLE "platform_roles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"is_operator" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name" jsonb NOT NULL,
	"default_locale" text NOT NULL,
	"locales" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "spaces_slug_unique" UNIQUE("slug"),
	CONSTRAINT "spaces_name_localized" CHECK (app.is_localized("spaces"."name")),
	CONSTRAINT "spaces_locales" CHECK (app.is_locale_list("spaces"."locales")),
	CONSTRAINT "spaces_default_locale" CHECK ("spaces"."default_locale" = any ("spaces"."locales"))
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"ui_locale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_ui_locale" CHECK ("user_profiles"."ui_locale" is null or app.is_locale_list(array["user_profiles"."ui_locale"])),
	CONSTRAINT "user_profiles_time_zone" CHECK (app.is_time_zone("user_profiles"."time_zone"))
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_roles" ADD CONSTRAINT "platform_roles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memberships_user_id_space_id_idx" ON "memberships" USING btree ("user_id","space_id");