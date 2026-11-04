-- The app schema holds the platform's shared SQL: helper functions that checks
-- and RLS policies call (Platform STEP 2). The Worker's role may use it, not
-- create in it.
create schema app;
--> statement-breakpoint
revoke all on schema app from public;
--> statement-breakpoint
grant usage on schema app to lr_app;
