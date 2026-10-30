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
--> statement-breakpoint
-- Every space keeps an owner. Checked at commit, so a hand-over inside one
-- transaction works; user.erase also locks the owner rows first, so two erases
-- of co-owners at once cannot both pass.
create function app.keep_an_owner() returns trigger
  language plpgsql security definer
  set search_path = pg_catalog, public
as $$
begin
  -- A space deleted along with its memberships (only the migrator can) needs none.
  if old.role = 'owner'
    and exists (select 1 from public.spaces as space where space.id = old.space_id)
    and not exists (
    select 1 from public.memberships as membership
     where membership.space_id = old.space_id and membership.role = 'owner'
  ) then
    raise exception 'space % would have no owner left', old.space_id using errcode = 'check_violation';
  end if;
  return null;
end;
$$;
--> statement-breakpoint
revoke execute on function app.keep_an_owner() from public;
--> statement-breakpoint
create constraint trigger memberships_keep_an_owner
  after update or delete on memberships
  deferrable initially deferred
  for each row execute function app.keep_an_owner();
