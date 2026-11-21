CREATE TABLE "tutor_questions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"asked_at" timestamp with time zone NOT NULL,
	"model" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"cost_microcents" bigint,
	"answered_at" timestamp with time zone,
	CONSTRAINT "tutor_questions_usage" CHECK (coalesce("tutor_questions"."prompt_tokens" >= 0 and "tutor_questions"."completion_tokens" >= 0 and "tutor_questions"."cost_microcents" >= 0, true))
);
--> statement-breakpoint
ALTER TABLE "tutor_questions" ADD CONSTRAINT "tutor_questions_enrollment_id_fkey" FOREIGN KEY ("enrollment_id","space_id","user_id") REFERENCES "public"."enrollments"("id","space_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tutor_questions_user_id_asked_at_idx" ON "tutor_questions" USING btree ("user_id","asked_at");