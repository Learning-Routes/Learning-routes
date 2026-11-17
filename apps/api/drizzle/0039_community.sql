CREATE TABLE "community_bans" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"banned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_blocks" (
	"user_id" uuid NOT NULL,
	"blocked_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_blocks_user_id_blocked_user_id_pk" PRIMARY KEY("user_id","blocked_user_id"),
	CONSTRAINT "community_blocks_not_self" CHECK ("community_blocks"."user_id" <> "community_blocks"."blocked_user_id")
);
--> statement-breakpoint
CREATE TABLE "community_follows" (
	"user_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_follows_user_id_space_id_pk" PRIMARY KEY("user_id","space_id")
);
--> statement-breakpoint
CREATE TABLE "community_posts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"parent_id" uuid,
	"author_id" uuid,
	"author_name" text DEFAULT '' NOT NULL,
	"kind" text,
	"lesson_id" uuid,
	"module_number" smallint,
	"body" text,
	"is_by_creator" boolean DEFAULT false NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_answer" boolean DEFAULT false NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_posts_id_space_id_key" UNIQUE("id","space_id"),
	CONSTRAINT "community_posts_kind" CHECK ("community_posts"."kind" is null or "community_posts"."kind" in ('question', 'win', 'note', 'milestone')),
	CONSTRAINT "community_posts_reply" CHECK (("community_posts"."parent_id" is null) = ("community_posts"."kind" is not null)),
	CONSTRAINT "community_posts_milestone" CHECK ((coalesce("community_posts"."kind", '') = 'milestone') = ("community_posts"."module_number" is not null) and (coalesce("community_posts"."kind", '') <> 'milestone' or "community_posts"."body" is null)),
	CONSTRAINT "community_posts_body" CHECK (coalesce("community_posts"."kind", '') = 'milestone' or "community_posts"."deleted_at" is not null or coalesce(char_length("community_posts"."body"), 0) between 1 and 2000),
	CONSTRAINT "community_posts_deleted" CHECK ("community_posts"."deleted_at" is null or "community_posts"."body" is null),
	CONSTRAINT "community_posts_answer" CHECK (not "community_posts"."is_answer" or "community_posts"."parent_id" is not null),
	CONSTRAINT "community_posts_pinned" CHECK (not "community_posts"."is_pinned" or "community_posts"."parent_id" is null)
);
--> statement-breakpoint
CREATE TABLE "community_reactions" (
	"post_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_reactions_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "community_reports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"post_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_reports_post_id_user_id_key" UNIQUE("post_id","user_id"),
	CONSTRAINT "community_reports_reason" CHECK ("community_reports"."reason" in ('spam', 'abuse', 'other'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_kind" CHECK ("notifications"."kind" in ('reply', 'answer', 'pinned'))
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "is_sharing_milestones" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_blocks" ADD CONSTRAINT "community_blocks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_blocks" ADD CONSTRAINT "community_blocks_blocked_user_id_user_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_follows" ADD CONSTRAINT "community_follows_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_follows" ADD CONSTRAINT "community_follows_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_route_id_fkey" FOREIGN KEY ("route_id","space_id") REFERENCES "public"."routes"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_parent_id_fkey" FOREIGN KEY ("parent_id","space_id") REFERENCES "public"."community_posts"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reactions" ADD CONSTRAINT "community_reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reactions" ADD CONSTRAINT "community_reactions_post_id_fkey" FOREIGN KEY ("post_id","space_id") REFERENCES "public"."community_posts"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_post_id_fkey" FOREIGN KEY ("post_id","space_id") REFERENCES "public"."community_posts"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_post_id_fkey" FOREIGN KEY ("post_id","space_id") REFERENCES "public"."community_posts"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_follows_space_id_idx" ON "community_follows" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "community_posts_route_id_created_at_idx" ON "community_posts" USING btree ("route_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "community_posts"."parent_id" is null;--> statement-breakpoint
CREATE INDEX "community_posts_parent_id_idx" ON "community_posts" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "community_posts_author_id_created_at_idx" ON "community_posts" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "community_posts_space_id_created_at_idx" ON "community_posts" USING btree ("space_id","created_at" DESC NULLS LAST) WHERE "community_posts"."parent_id" is null and "community_posts"."is_by_creator";--> statement-breakpoint
CREATE INDEX "community_reports_open_idx" ON "community_reports" USING btree ("created_at") WHERE "community_reports"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "community_reports_user_id_created_at_idx" ON "community_reports" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);