-- lr_app's privileges on the tutor's questions (Platform STEP 20). Safe to run again: the database
-- runbook re-runs it after a restore, right after 0013. test/db/grants.test.ts holds the same set.
grant select, insert on tutor_questions to lr_app;
--> statement-breakpoint
-- What an answer used, once; and a question no model answered is given back.
grant update (model, prompt_tokens, completion_tokens, cost_microcents, answered_at)
  on tutor_questions to lr_app;
--> statement-breakpoint
grant delete on tutor_questions to lr_app;
