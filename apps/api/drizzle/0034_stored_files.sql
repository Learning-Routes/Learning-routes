CREATE TABLE "stored_files" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stored_files_space_id_key_key" UNIQUE("space_id","key"),
	CONSTRAINT "stored_files_kind" CHECK ("stored_files"."kind" in ('creation', 'asset')),
	CONSTRAINT "stored_files_bytes_positive" CHECK ("stored_files"."bytes" > 0)
);
--> statement-breakpoint
-- squawk-ignore ban-drop-constraint
ALTER TABLE "blocks" DROP CONSTRAINT "blocks_kind";--> statement-breakpoint
-- squawk-ignore constraint-missing-not-valid
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Validated in 0035, apart, so no write waits on the scan.
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_kind" CHECK ("blocks"."kind" in ('concept', 'check', 'tip', 'example', 'summary', 'drag_drop', 'fill_blank', 'code_playground', 'simulation', 'scenario', 'cards', 'visual', 'motion', 'audio', 'audio_explainer', 'video', 'interactive')) NOT VALID;