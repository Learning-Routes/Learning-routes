-- lr_app's privileges on the tenancy tables (Platform STEP 2 §2). RLS (§3)
-- narrows each to the rows the acting user may see.
grant select, insert, update on user_profiles to lr_app;
--> statement-breakpoint
-- A space and its first owner are made by the seed, as the migrator; no action
-- creates a space yet.
grant select, update on spaces to lr_app;
--> statement-breakpoint
-- No action changes or removes a membership yet; grant them when one does.
grant select, insert on memberships to lr_app;
--> statement-breakpoint
grant select on platform_roles to lr_app;
