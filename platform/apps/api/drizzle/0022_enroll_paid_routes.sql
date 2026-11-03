-- A paid route's module 1 is free, so "Empezar gratis" enrolls in it (Platform STEP 4 §6.1);
-- paying for the rest is Platform STEP 6's. Otherwise as in 0012: the only way to become a
-- student, checked here and not from the caller.
create or replace function app.enroll(route_id uuid) returns table (outcome text, enrollment_id uuid)
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
  if target.access <> 'open' then
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
