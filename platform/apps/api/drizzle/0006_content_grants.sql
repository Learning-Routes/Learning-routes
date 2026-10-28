-- lr_app's privileges on a route's draft (Platform STEP 2 §2). Content is
-- archived, never deleted; only a prerequisite can be removed. RLS (§3) narrows
-- each to the spaces where the acting user may read or edit.
grant select, insert, update on routes, modules, lessons, blocks to lr_app;
--> statement-breakpoint
grant select, insert, delete on lesson_prerequisites to lr_app;
