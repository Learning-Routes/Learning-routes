-- lr_app's privileges on route images (Platform STEP 20). Safe to run again: the database runbook
-- re-runs it after a restore, right after 0013. test/db/grants.test.ts holds the same set.
grant select, insert on image_generations to lr_app;
--> statement-breakpoint
-- What an image used and the asset it became, once; and an image no model made is given back.
grant update (model, prompt_tokens, completion_tokens, cost_microcents, asset_key, made_at)
  on image_generations to lr_app;
--> statement-breakpoint
grant delete on image_generations to lr_app;
