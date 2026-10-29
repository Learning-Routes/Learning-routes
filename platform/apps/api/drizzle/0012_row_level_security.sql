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
-- memberships is enabled, not forced: its owner, the migrator, runs app.member_space_ids.
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
create policy memberships_update on memberships for update to lr_app
  using (space_id = any ((select app.member_space_ids('{owner}'))::uuid[]))
  with check (space_id = any ((select app.member_space_ids('{owner}'))::uuid[]));
--> statement-breakpoint
create policy memberships_delete on memberships for delete to lr_app
  using (space_id = any ((select app.member_space_ids('{owner}'))::uuid[]));
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
create policy route_versions_select on route_versions for select to lr_app
  using (space_id = any ((select app.member_space_ids('{owner,coeditor,assistant,student}'))::uuid[]));
--> statement-breakpoint
create policy route_versions_insert on route_versions for insert to lr_app
  with check (space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[]));
--> statement-breakpoint
create policy enrollments_select on enrollments for select to lr_app
  using (user_id = (select app.user_id()) or space_id = any ((select app.member_space_ids('{owner,assistant}'))::uuid[]));
--> statement-breakpoint
create policy enrollments_update on enrollments for update to lr_app
  using (user_id = (select app.user_id()) or space_id = any ((select app.member_space_ids('{owner}'))::uuid[]))
  with check (user_id = (select app.user_id()) or space_id = any ((select app.member_space_ids('{owner}'))::uuid[]));
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
-- is published, open and free, read here and not from the caller; makes the
-- caller a student of the space if they hold no role there; and pins the latest
-- published version. A route the caller cannot see answers not_found; a paid or
-- closed one they can see answers invalid.
create function app.enroll(route_id uuid) returns table (outcome text, enrollment_id uuid)
  language plpgsql volatile security definer
  set search_path = pg_catalog, public
as $$
declare
  me uuid := app.user_id();
  target record;
  is_member boolean;
  enrolled uuid;
begin
  select route.id, route.space_id, route.access, route.pricing, route.latest_published_version
    into target
    from public.routes as route
   where route.id = enroll.route_id and route.archived_at is null and route.latest_published_version is not null;
  if me is null or not found then
    return query select 'not_found', null::uuid;
    return;
  end if;
  is_member := exists (
    select 1 from public.memberships as membership
     where membership.space_id = target.space_id and membership.user_id = me
  );
  if target.access <> 'open' or target.pricing <> 'free' then
    return query select case when is_member then 'invalid' else 'not_found' end, null::uuid;
    return;
  end if;
  if not is_member then
    insert into public.memberships (space_id, user_id, role) values (target.space_id, me, 'student');
  end if;
  insert into public.enrollments (space_id, route_id, user_id, pinned_version, status)
  values (target.space_id, target.id, me, target.latest_published_version, 'active')
  on conflict on constraint enrollments_user_id_route_id_key do nothing
  returning id into enrolled;
  if enrolled is null then
    select enrollment.id into enrolled from public.enrollments as enrollment
     where enrollment.user_id = me and enrollment.route_id = target.id;
  end if;
  return query select 'ok', enrolled;
end;
$$;
--> statement-breakpoint
revoke execute on function app.enroll(uuid) from public;
--> statement-breakpoint
grant execute on function app.enroll(uuid) to lr_app;
