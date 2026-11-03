-- lr_app's privileges on the catalog (Platform STEP 4 §2). Safe to run again: the
-- database runbook re-runs it after a restore, right after 0013, whose revoke clears
-- these too. test/db/grants.test.ts holds the same set.
grant select, insert on catalog_listings to lr_app;
--> statement-breakpoint
grant update (status, note, decided_at, decided_by, decided_version, featured_position)
  on catalog_listings to lr_app;
--> statement-breakpoint
grant select, insert on creator_applications to lr_app;
--> statement-breakpoint
grant update (status, decided_at) on creator_applications to lr_app;
--> statement-breakpoint
-- A route's topic, level and price, and what a creator's page says.
grant update (topic, level, price_minor, currency) on routes to lr_app;
--> statement-breakpoint
grant execute on function app.is_operator() to lr_app;
