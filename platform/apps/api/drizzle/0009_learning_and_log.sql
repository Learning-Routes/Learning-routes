CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"state" text,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"stability" double precision DEFAULT 0 NOT NULL,
	"difficulty" double precision DEFAULT 0 NOT NULL,
	"last_review_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"fsrs_params_version" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cards_user_id_item_id_key" UNIQUE("user_id","item_id"),
	CONSTRAINT "cards_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "cards_state" CHECK ("cards"."state" in ('new', 'learning', 'review', 'relearning'))
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"pinned_version" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollments_user_id_route_id_key" UNIQUE("user_id","route_id"),
	CONSTRAINT "enrollments_id_space_id_user_id_key" UNIQUE("id","space_id","user_id"),
	CONSTRAINT "enrollments_status" CHECK ("enrollments"."status" in ('active', 'revoked', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "progress" (
	"enrollment_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"completed_at" timestamp with time zone,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_enrollment_id_lesson_id_pk" PRIMARY KEY("enrollment_id","lesson_id"),
	CONSTRAINT "progress_status" CHECK ("progress"."status" in ('not_started', 'in_progress', 'completed')),
	CONSTRAINT "progress_blocks_array" CHECK (jsonb_typeof("progress"."blocks") = 'array')
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"elapsed_ms" integer NOT NULL,
	"state_before" jsonb NOT NULL,
	CONSTRAINT "reviews_user_id_review_id_key" UNIQUE("user_id","review_id"),
	CONSTRAINT "reviews_rating" CHECK ("reviews"."rating" between 1 and 4),
	CONSTRAINT "reviews_elapsed_ms" CHECK ("reviews"."elapsed_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "action_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_via" text NOT NULL,
	"agent_run_id" uuid,
	"action" text NOT NULL,
	"input" jsonb NOT NULL,
	"outcome" text NOT NULL,
	"route_revision" bigint,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_log_actor_via" CHECK ("action_log"."actor_via" in ('ui', 'mcp', 'agent'))
);
--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_route_id_fkey" FOREIGN KEY ("route_id","space_id") REFERENCES "public"."routes"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_pinned_version_fkey" FOREIGN KEY ("route_id","pinned_version") REFERENCES "public"."route_versions"("route_id","version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_enrollment_id_fkey" FOREIGN KEY ("enrollment_id","space_id","user_id") REFERENCES "public"."enrollments"("id","space_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_card_id_fkey" FOREIGN KEY ("card_id","user_id") REFERENCES "public"."cards"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_log" ADD CONSTRAINT "action_log_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reviews_user_id_card_id_reviewed_at_idx" ON "reviews" USING btree ("user_id","card_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "action_log_space_id_at_idx" ON "action_log" USING btree ("space_id","at");