CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"position" text collate "C" NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "blocks_lesson_id_position_key" UNIQUE("lesson_id","position"),
	CONSTRAINT "blocks_kind" CHECK ("blocks"."kind" in ('concept', 'check', 'tip', 'example', 'summary', 'drag_drop', 'fill_blank', 'code_playground', 'simulation', 'scenario', 'cards', 'visual', 'motion', 'audio', 'audio_explainer', 'video')),
	CONSTRAINT "blocks_data_object" CHECK (jsonb_typeof("blocks"."data") = 'object')
);
--> statement-breakpoint
CREATE TABLE "lesson_prerequisites" (
	"space_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"requires_lesson_id" uuid NOT NULL,
	CONSTRAINT "lesson_prerequisites_lesson_id_requires_lesson_id_pk" PRIMARY KEY("lesson_id","requires_lesson_id"),
	CONSTRAINT "lesson_prerequisites_not_itself" CHECK ("lesson_prerequisites"."lesson_id" <> "lesson_prerequisites"."requires_lesson_id")
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"position" text collate "C" NOT NULL,
	"title" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "lessons_module_id_position_key" UNIQUE("module_id","position"),
	CONSTRAINT "lessons_id_space_id_key" UNIQUE("id","space_id"),
	CONSTRAINT "lessons_id_route_id_space_id_key" UNIQUE("id","route_id","space_id"),
	CONSTRAINT "lessons_title_localized" CHECK (app.is_localized("lessons"."title"))
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"position" text collate "C" NOT NULL,
	"title" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "modules_route_id_position_key" UNIQUE("route_id","position"),
	CONSTRAINT "modules_id_route_id_space_id_key" UNIQUE("id","route_id","space_id"),
	CONSTRAINT "modules_title_localized" CHECK (app.is_localized("modules"."title"))
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" jsonb NOT NULL,
	"description" jsonb,
	"source_locale" text NOT NULL,
	"access" text NOT NULL,
	"pricing" text NOT NULL,
	"draft_revision" bigint DEFAULT 0 NOT NULL,
	"latest_published_version" integer,
	"forked_from_space_id" uuid,
	"forked_from_route_id" uuid,
	"forked_from_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "routes_space_id_slug_key" UNIQUE("space_id","slug"),
	CONSTRAINT "routes_id_space_id_key" UNIQUE("id","space_id"),
	CONSTRAINT "routes_title_localized" CHECK (app.is_localized("routes"."title") and "routes"."title" ? "routes"."source_locale"),
	CONSTRAINT "routes_description_localized" CHECK (app.is_localized("routes"."description")),
	CONSTRAINT "routes_source_locale" CHECK (app.is_locale_list(array["routes"."source_locale"])),
	CONSTRAINT "routes_access" CHECK ("routes"."access" in ('open', 'closed')),
	CONSTRAINT "routes_pricing" CHECK ("routes"."pricing" in ('free', 'paid'))
);
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_lesson_id_fkey" FOREIGN KEY ("lesson_id","space_id") REFERENCES "public"."lessons"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_prerequisites" ADD CONSTRAINT "lesson_prerequisites_route_id_fkey" FOREIGN KEY ("route_id","space_id") REFERENCES "public"."routes"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_prerequisites" ADD CONSTRAINT "lesson_prerequisites_lesson_id_fkey" FOREIGN KEY ("lesson_id","route_id","space_id") REFERENCES "public"."lessons"("id","route_id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_prerequisites" ADD CONSTRAINT "lesson_prerequisites_requires_lesson_id_fkey" FOREIGN KEY ("requires_lesson_id","route_id","space_id") REFERENCES "public"."lessons"("id","route_id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_fkey" FOREIGN KEY ("module_id","route_id","space_id") REFERENCES "public"."modules"("id","route_id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_route_id_fkey" FOREIGN KEY ("route_id","space_id") REFERENCES "public"."routes"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;