-- lr_app's privileges on a route's draft (Platform STEP 2 §2). Content is
-- archived, never deleted; only a prerequisite can be removed. RLS (§3) narrows
-- each to the spaces where the acting user may read or edit.
-- UPDATE is column by column: never an id, a space or a parent, nor a route's
-- draft revision or published version, which change only through security
-- definer functions (§3).
grant select, insert on routes, modules, lessons, blocks to lr_app;
--> statement-breakpoint
grant update (slug, title, description, source_locale, access, pricing, updated_at, archived_at)
  on routes to lr_app;
--> statement-breakpoint
grant update (position, title, updated_at, archived_at) on modules, lessons to lr_app;
--> statement-breakpoint
grant update (position, kind, data, updated_at, archived_at) on blocks to lr_app;
--> statement-breakpoint
grant select, insert, delete on lesson_prerequisites to lr_app;
