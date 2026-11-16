-- The player's question types (Platform STEP 12). Widened, so every row already passes.
-- squawk-ignore ban-drop-constraint
ALTER TABLE "blocks" DROP CONSTRAINT "blocks_kind";--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_kind" CHECK ("blocks"."kind" in ('concept', 'check', 'tip', 'example', 'summary', 'drag_drop', 'fill_blank', 'code_playground', 'simulation', 'scenario', 'cards', 'order', 'true_false', 'estimate', 'hotspot', 'worked_example', 'speak', 'code_check', 'open_answer', 'sim', 'visual', 'motion', 'audio', 'audio_explainer', 'video', 'interactive')) NOT VALID;
-- Validated in 0038, apart, so no write waits on the scan.