CREATE TABLE "creator_invitations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"application_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_invitations_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
-- squawk-ignore ban-drop-constraint
ALTER TABLE "creator_applications" DROP CONSTRAINT "creator_applications_status";--> statement-breakpoint
-- squawk-ignore constraint-missing-not-valid
ALTER TABLE "creator_invitations" ADD CONSTRAINT "creator_invitations_application_id_creator_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."creator_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX "creator_invitations_application_idx" ON "creator_invitations" USING btree ("application_id");--> statement-breakpoint
-- squawk-ignore constraint-missing-not-valid
ALTER TABLE "creator_applications" ADD CONSTRAINT "creator_applications_status" CHECK ("creator_applications"."status" in ('new', 'invited', 'declined', 'joined'));