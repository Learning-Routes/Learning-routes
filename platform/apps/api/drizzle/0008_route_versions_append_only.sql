-- route_versions is append-only (Platform STEP 2 §2.10). lr_app may only select and
-- insert; these triggers refuse an update, delete or truncate to every role,
-- the migrator that owns the table included.
create function app.refuse_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'restrict_violation';
end;
$$;
--> statement-breakpoint
create trigger route_versions_append_only
  before update or delete on route_versions
  for each row execute function app.refuse_change();
--> statement-breakpoint
create trigger route_versions_no_truncate
  before truncate on route_versions
  for each statement execute function app.refuse_change();
--> statement-breakpoint
grant select, insert on route_versions to lr_app;
