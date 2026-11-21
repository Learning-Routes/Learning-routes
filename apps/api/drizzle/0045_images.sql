CREATE TABLE "image_generations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"asked_at" timestamp with time zone NOT NULL,
	"model" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"cost_microcents" bigint,
	"asset_key" text,
	"made_at" timestamp with time zone,
	CONSTRAINT "image_generations_usage" CHECK (coalesce("image_generations"."prompt_tokens" >= 0 and "image_generations"."completion_tokens" >= 0 and "image_generations"."cost_microcents" >= 0, true))
);
--> statement-breakpoint
ALTER TABLE "image_generations" ADD CONSTRAINT "image_generations_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "image_generations_user_id_asked_at_idx" ON "image_generations" USING btree ("user_id","asked_at");