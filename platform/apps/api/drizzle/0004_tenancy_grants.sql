-- lr_app's privileges on the tenancy tables (Platform STEP 2 §2). RLS (§3)
-- narrows each to the rows the acting user may see.
grant select, insert, update on user_profiles, spaces to lr_app;
--> statement-breakpoint
grant select, insert, update, delete on memberships to lr_app;
--> statement-breakpoint
grant select on platform_roles to lr_app;
