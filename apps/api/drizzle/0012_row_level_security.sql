-- Row-level security, the second fence (Platform STEP 2 §3.4–§3.8). It holds the
-- same lines as core's permission table without relying on it: a user sees and
-- changes only what their role in a space allows, and everything else does not
-- exist for them. Every transaction sets app.user_id first (withDb); with none
-- set, every policy matches nothing.

-- The acting user, or null. A pooled connection's next transaction reads '' here,
-- not null, so nullif keeps ''::uuid from throwing.
create function app.user_id() returns uuid
  language sql stable parallel safe
  return nullif(current_setting('app.user_id', true), '')::uuid;
--> statement-breakpoint
-- The spaces where the acting user holds one of roles. Security definer, owned by
-- the migrator, so a policy reads memberships through it instead of selecting the
-- table it guards, which would recurse.
create function app.member_space_ids(roles text[]) returns uuid[]
  language sql stable security definer
  set search_path = pg_catalog, public
  return array(
    select membership.space_id from public.memberships as membership
     where membership.user_id = app.user_id() and membership.role = any (roles)
  );
--> statement-breakpoint
revoke execute on function app.member_space_ids(text[]) from public;
--> statement-breakpoint
grant execute on function app.member_space_ids(text[]) to lr_app;
--> statement-breakpoint
alter table user_profiles enable row level security;
--> statement-breakpoint
alter table spaces enable row level security;
--> statement-breakpoint
alter table platform_roles enable row level security;
--> statement-breakpoint
alter table routes enable row level security;
--> statement-breakpoint
alter table modules enable row level security;
--> statement-breakpoint
alter table lessons enable row level security;
--> statement-breakpoint
alter table blocks enable row level security;
--> statement-breakpoint
alter table lesson_prerequisites enable row level security;
--> statement-breakpoint
alter table route_versions enable row level security;
--> statement-breakpoint
alter table enrollments enable row level security;
--> statement-breakpoint
alter table progress enable row level security;
--> statement-breakpoint
alter table cards enable row level security;
--> statement-breakpoint
alter table reviews enable row level security;
--> statement-breakpoint
alter table action_log enable row level security;
--> statement-breakpoint
-- memberships is enabled, not forced, as the STEP asks. The migrator, which owns it
-- and app.member_space_ids, bypasses RLS today; if an owner ever does not,
-- forcing would make the helper read memberships through the policies that call it.
alter table memberships enable row level security;
--> statement-breakpoint
alter table user_profiles force row level security;
--> statement-breakpoint
alter table spaces force row level security;
--> statement-breakpoint
alter table platform_roles force row level security;
--> statement-breakpoint
alter table routes force row level security;
--> statement-breakpoint
alter table modules force row level security;
--> statement-breakpoint
alter table lessons force row level security;
--> statement-breakpoint
alter table blocks force row level security;
--> statement-breakpoint
alter table lesson_prerequisites force row level security;
--> statement-breakpoint
alter table route_versions force row level security;
--> statement-breakpoint
alter table enrollments force row level security;
--> statement-breakpoint
alter table progress force row level security;
--> statement-breakpoint
alter table cards force row level security;
--> statement-breakpoint
alter table reviews force row level security;
--> statement-breakpoint
alter table action_log force row level security;
--> statement-breakpoint
create policy user_profiles_select on user_profiles for select to lr_app
  using (user_id = (select app.user_id()));
--> statement-breakpoint
create policy user_profiles_insert on user_profiles for insert to lr_app
  with check (user_id = (select app.user_id()));
--> statement-breakpoint
create policy user_profiles_update on user_profiles for update to lr_app
  using (user_id = (select app.user_id()))
  with check (user_id = (select app.user_id()));
--> statement-breakpoint
create policy spaces_select on spaces for select to lr_app
  using (id = any ((select app.member_space_ids('{owner,coeditor,assistant,student}'))::uuid[]));
--> statement-breakpoint
create policy spaces_update on spaces for update to lr_app
  using (id = any ((select app.member_space_ids('{owner}'))::uuid[]))
  with check (id = any ((select app.member_space_ids('{owner}'))::uuid[]));
--> statement-breakpoint
create policy memberships_select on memberships for select to lr_app
  using (user_id = (select app.user_id()) or space_id = any ((select app.member_space_ids('{owner}'))::uuid[]));
--> statement-breakpoint
create policy memberships_insert on memberships for insert to lr_app
  with check (space_id = any ((select app.member_space_ids('{owner}'))::uuid[]));
--> statement-breakpoint
create policy platform_roles_select on platform_roles for select to lr_app
  using (user_id = (select app.user_id()));
--> statement-breakpoint
create policy routes_select on routes for select to lr_app
  using (space_id = any ((select app.member_space_ids('{owner,coeditor,assistant}'))::uuid[]));
--> statement-breakpoint
create policy routes_insert on routes for insert to lr_app
  with check (space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[]));
--> statement-breakpoint
create policy routes_update on routes for update to lr_app
  using (space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[]))
  with check (space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[]));
--> statement-breakpoint
create policy modules_select on modules for select to lr_app
  using (space_id = any ((select app.member_space_ids('{owner,coeditor,assistant}'))::uuid[]));
--> statement-breakpoint
create policy modules_insert on modules for insert to lr_app
  with check (space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[]));
--> statement-breakpoint
create policy modules_update on modules for update to lr_app
  using (space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[]))
  with check (space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[]));
--> statement-breakpoint
create policy lessons_select on lessons for select to lr_app
  using (space_id = any ((select app.member_space_ids('{owner,coeditor,assistant}'))::uuid[]));
--> statement-breakpoint
create policy lessons_insert on lessons for insert to lr_app
  with check (space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[]));
--> statement-breakpoint
create policy lessons_update on lessons for update to lr_app
  using (space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[]))
  with check (space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[]));
--> statement-breakpoint
create policy blocks_select on blocks for select to lr_app
  using (space_id = any ((select app.member_space_ids('{owner,coeditor,assistant}'))::uuid[]));
--> statement-breakpoint
create policy blocks_insert on blocks for insert to lr_app
  with check (space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[]));
--> statement-breakpoint
create policy blocks_update on blocks for update to lr_app
  using (space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[]))
  with check (space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[]));
--> statement-breakpoint
create policy lesson_prerequisites_select on lesson_prerequisites for select to lr_app
  using (space_id = any ((select app.member_space_ids('{owner,coeditor,assistant}'))::uuid[]));
--> statement-breakpoint
create policy lesson_prerequisites_insert on lesson_prerequisites for insert to lr_app
  with check (space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[]));
--> statement-breakpoint
create policy lesson_prerequisites_delete on lesson_prerequisites for delete to lr_app
  using (space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[]));
--> statement-breakpoint
-- Staff read every version in the space; a student only the routes they hold an
-- active enrollment in (enrollments' own policy shows them only their own).
create policy route_versions_select on route_versions for select to lr_app
  using (
    space_id = any ((select app.member_space_ids('{owner,coeditor,assistant}'))::uuid[])
    or exists (
      select 1 from enrollments as enrollment
       where enrollment.route_id = route_versions.route_id
         and enrollment.user_id = (select app.user_id())
         and enrollment.status = 'active'
    )
  );
--> statement-breakpoint
create policy route_versions_insert on route_versions for insert to lr_app
  with check (space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[]));
--> statement-breakpoint
create policy enrollments_select on enrollments for select to lr_app
  using (user_id = (select app.user_id()) or space_id = any ((select app.member_space_ids('{owner,assistant}'))::uuid[]));
--> statement-breakpoint
create policy progress_select on progress for select to lr_app
  using (user_id = (select app.user_id()) or space_id = any ((select app.member_space_ids('{owner,assistant}'))::uuid[]));
--> statement-breakpoint
create policy progress_insert on progress for insert to lr_app
  with check (user_id = (select app.user_id()) and space_id = any ((select app.member_space_ids('{owner,coeditor,assistant,student}'))::uuid[]));
--> statement-breakpoint
create policy progress_update on progress for update to lr_app
  using (user_id = (select app.user_id()))
  with check (user_id = (select app.user_id()) and space_id = any ((select app.member_space_ids('{owner,coeditor,assistant,student}'))::uuid[]));
--> statement-breakpoint
create policy cards_select on cards for select to lr_app
  using (user_id = (select app.user_id()) or space_id = any ((select app.member_space_ids('{owner,assistant}'))::uuid[]));
--> statement-breakpoint
create policy cards_insert on cards for insert to lr_app
  with check (user_id = (select app.user_id()) and space_id = any ((select app.member_space_ids('{owner,coeditor,assistant,student}'))::uuid[]));
--> statement-breakpoint
create policy cards_update on cards for update to lr_app
  using (user_id = (select app.user_id()))
  with check (user_id = (select app.user_id()) and space_id = any ((select app.member_space_ids('{owner,coeditor,assistant,student}'))::uuid[]));
--> statement-breakpoint
create policy reviews_select on reviews for select to lr_app
  using (user_id = (select app.user_id()));
--> statement-breakpoint
create policy reviews_insert on reviews for insert to lr_app
  with check (user_id = (select app.user_id()) and space_id = any ((select app.member_space_ids('{owner,coeditor,assistant,student}'))::uuid[]));
--> statement-breakpoint
create policy action_log_select on action_log for select to lr_app
  using (space_id = any ((select app.member_space_ids('{owner}'))::uuid[]));
--> statement-breakpoint
create policy action_log_insert on action_log for insert to lr_app
  with check (actor_user_id = (select app.user_id()) and space_id = any ((select app.member_space_ids('{owner,coeditor,assistant,student}'))::uuid[]));
--> statement-breakpoint
-- enrollment.create (§3.8), the only way to become a student. It checks the route
-- is published, open and free and its space is live, read here and not from the
-- caller. An existing enrollment answers first: the same one back if active,
-- invalid if revoked or expired, and no membership is made either way. Otherwise
-- it makes the caller a student of the space if they hold no role there, and pins
-- the latest published version. A route the caller cannot see answers not_found;
-- a paid or closed one they can see answers invalid.
create function app.enroll(route_id uuid) returns table (outcome text, enrollment_id uuid)
  language plpgsql volatile security definer
  set search_path = pg_catalog, public
as $$
declare
  me uuid := app.user_id();
  target record;
  is_member boolean;
  existing record;
  enrolled uuid;
begin
  select route.id, route.space_id, route.access, route.pricing, route.latest_published_version
    into target
    from public.routes as route
    join public.spaces as space on space.id = route.space_id and space.archived_at is null
   where route.id = enroll.route_id and route.archived_at is null and route.latest_published_version is not null;
  if me is null or not found then
    return query select 'not_found', null::uuid;
    return;
  end if;
  is_member := exists (
    select 1 from public.memberships as membership
     where membership.space_id = target.space_id and membership.user_id = me
  );
  select enrollment.id, enrollment.status into existing from public.enrollments as enrollment
   where enrollment.user_id = me and enrollment.route_id = target.id;
  if found then
    return query select case when existing.status = 'active' then 'ok' else 'invalid' end,
                        case when existing.status = 'active' then existing.id end;
    return;
  end if;
  if target.access <> 'open' or target.pricing <> 'free' then
    return query select case when is_member then 'invalid' else 'not_found' end, null::uuid;
    return;
  end if;
  if not is_member then
    -- Two enrolls at once in one space would both find no membership.
    insert into public.memberships (space_id, user_id, role) values (target.space_id, me, 'student')
    on conflict do nothing;
  end if;
  insert into public.enrollments (space_id, route_id, user_id, pinned_version, status)
  values (target.space_id, target.id, me, target.latest_published_version, 'active')
  on conflict on constraint enrollments_user_id_route_id_key do nothing
  returning id into enrolled;
  if enrolled is null then
    -- A concurrent enroll of the same route won; answer with its enrollment.
    select enrollment.id into enrolled from public.enrollments as enrollment
     where enrollment.user_id = me and enrollment.route_id = target.id and enrollment.status = 'active';
  end if;
  return query select case when enrolled is null then 'invalid' else 'ok' end, enrolled;
end;
$$;
--> statement-breakpoint
revoke execute on function app.enroll(uuid) from public;
--> statement-breakpoint
grant execute on function app.enroll(uuid) to lr_app;
--> statement-breakpoint
-- enrollment.upgrade: the caller's own active enrollment moves to its route's
-- latest published version, never back. The pinned version after, or null when
-- the enrollment is not the caller's, or not active.
create function app.upgrade_enrollment(enrollment_id uuid) returns integer
  language plpgsql volatile security definer
  set search_path = pg_catalog, public
as $$
declare
  current record;
begin
  select enrollment.id, enrollment.pinned_version, route.latest_published_version as latest
    into current
    from public.enrollments as enrollment
    join public.routes as route on route.id = enrollment.route_id and route.space_id = enrollment.space_id
   where enrollment.id = upgrade_enrollment.enrollment_id
     and enrollment.user_id = app.user_id() and enrollment.status = 'active'
     for update of enrollment;
  if not found then
    return null;
  end if;
  if current.latest is not null and current.latest > current.pinned_version then
    update public.enrollments set pinned_version = current.latest, updated_at = now()
     where id = current.id;
    return current.latest;
  end if;
  return current.pinned_version;
end;
$$;
--> statement-breakpoint
revoke execute on function app.upgrade_enrollment(uuid) from public;
--> statement-breakpoint
grant execute on function app.upgrade_enrollment(uuid) to lr_app;
--> statement-breakpoint
-- An owner revokes, expires or restores an enrollment in their space. False when
-- the caller is not an owner there, or there is no such enrollment.
create function app.set_enrollment_status(enrollment_id uuid, status text) returns boolean
  language plpgsql volatile security definer
  set search_path = pg_catalog, public
as $$
begin
  update public.enrollments as enrollment
     set status = set_enrollment_status.status, updated_at = now()
   where enrollment.id = set_enrollment_status.enrollment_id
     and enrollment.space_id = any (app.member_space_ids('{owner}'));
  return found;
end;
$$;
--> statement-breakpoint
revoke execute on function app.set_enrollment_status(uuid, text) from public;
--> statement-breakpoint
grant execute on function app.set_enrollment_status(uuid, text) to lr_app;
--> statement-breakpoint
-- Every draft edit names the revision it read (§4.3): an owner or coeditor moves
-- it one forward. The new revision, or null on a stale one or another's route.
create function app.bump_draft(route_id uuid, space_id uuid, expected bigint) returns bigint
  language plpgsql volatile security definer
  set search_path = pg_catalog, public
as $$
declare
  revision bigint;
begin
  update public.routes as route
     set draft_revision = route.draft_revision + 1, updated_at = now()
   where route.id = bump_draft.route_id and route.space_id = bump_draft.space_id
     and route.draft_revision = bump_draft.expected
     and route.space_id = any (app.member_space_ids('{owner,coeditor}'))
  returning route.draft_revision into revision;
  return revision;
end;
$$;
--> statement-breakpoint
revoke execute on function app.bump_draft(uuid, uuid, bigint) from public;
--> statement-breakpoint
grant execute on function app.bump_draft(uuid, uuid, bigint) to lr_app;
--> statement-breakpoint
-- route.publish records the version it appended: an owner or coeditor, on a live
-- route, to a version that exists and is newer than the last.
create function app.mark_published(route_id uuid, space_id uuid, version integer) returns boolean
  language plpgsql volatile security definer
  set search_path = pg_catalog, public
as $$
begin
  update public.routes as route
     set latest_published_version = mark_published.version, updated_at = now()
   where route.id = mark_published.route_id and route.space_id = mark_published.space_id
     and route.archived_at is null
     and mark_published.version > coalesce(route.latest_published_version, 0)
     and route.space_id = any (app.member_space_ids('{owner,coeditor}'))
     and exists (
       select 1 from public.route_versions as published
        where published.route_id = route.id and published.space_id = route.space_id
          and published.version = mark_published.version
     );
  return found;
end;
$$;
--> statement-breakpoint
revoke execute on function app.mark_published(uuid, uuid, integer) from public;
--> statement-breakpoint
grant execute on function app.mark_published(uuid, uuid, integer) to lr_app;
--> statement-breakpoint
-- Pricing and access are an owner's (core's permission table says the same): a
-- coeditor neither changes them nor creates a paid route. Roles that bypass row-
-- level security, the migrator and the seed, are not checked.
create function app.owner_sets_pricing() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if (select role.rolbypassrls from pg_catalog.pg_roles as role where role.rolname = current_user) then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.pricing = 'paid')
     or (tg_op = 'UPDATE' and (new.pricing is distinct from old.pricing or new.access is distinct from old.access)) then
    if not (new.space_id = any (app.member_space_ids('{owner}'))) then
      raise exception 'only an owner sets a route''s pricing and access' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;
--> statement-breakpoint
create trigger routes_owner_sets_pricing
  before insert or update of pricing, access on routes
  for each row execute function app.owner_sets_pricing();
