CREATE TABLE "route_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"snapshot_format" smallint NOT NULL,
	"content_hash" text NOT NULL,
	"published_by_user_id" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "route_versions_route_id_version_key" UNIQUE("route_id","version"),
	CONSTRAINT "route_versions_version" CHECK ("route_versions"."version" > 0),
	CONSTRAINT "route_versions_snapshot_format" CHECK ("route_versions"."snapshot_format" > 0),
	CONSTRAINT "route_versions_content_hash" CHECK ("route_versions"."content_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "route_versions" ADD CONSTRAINT "route_versions_route_id_fkey" FOREIGN KEY ("route_id","space_id") REFERENCES "public"."routes"("id","space_id") ON DELETE restrict ON UPDATE no action;