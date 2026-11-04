-- The second fence for the catalog (Platform STEP 4 §2.3–§2.5), and what strangers see.
alter table catalog_listings enable row level security;
--> statement-breakpoint
alter table catalog_listings force row level security;
--> statement-breakpoint
alter table creator_applications enable row level security;
--> statement-breakpoint
alter table creator_applications force row level security;
--> statement-breakpoint
create policy catalog_listings_select on catalog_listings for select to lr_app
  using (
    space_id = any ((select app.member_space_ids('{owner,coeditor,assistant}'))::uuid[])
    or (select app.is_operator())
  );
--> statement-breakpoint
-- An owner asks; nobody approves their own route.
create policy catalog_listings_insert on catalog_listings for insert to lr_app
  with check (
    space_id = any ((select app.member_space_ids('{owner}'))::uuid[])
    and status = 'requested' and decided_at is null and decided_by is null
    and decided_version is null and featured_position is null
  );
--> statement-breakpoint
-- An owner can only withdraw.
create policy catalog_listings_withdraw on catalog_listings for update to lr_app
  using (space_id = any ((select app.member_space_ids('{owner}'))::uuid[]))
  with check (
    space_id = any ((select app.member_space_ids('{owner}'))::uuid[])
    and status = 'withdrawn' and featured_position is null
  );
--> statement-breakpoint
create policy catalog_listings_decide on catalog_listings for update to lr_app
  using ((select app.is_operator()))
  with check ((select app.is_operator()));
--> statement-breakpoint
-- The policies say who may update a row, not which columns. The decision's record is the
-- operator's: an owner who withdraws changes the status, and nothing that would forge it.
-- Withdrawing takes a route off the landing, which is the one change to its place an owner
-- causes. Only lr_app is held: the migrator, which runs the seed, acts for no one.
create function app.guard_catalog_decision() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if current_user <> 'lr_app' or app.is_operator() then
    return new;
  end if;
  if (new.note, new.decided_at, new.decided_by, new.decided_version)
       is distinct from (old.note, old.decided_at, old.decided_by, old.decided_version)
     or (new.featured_position is distinct from old.featured_position
         and not (new.status = 'withdrawn' and new.featured_position is null))
  then
    raise exception 'only an operator writes a listing''s decision'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
--> statement-breakpoint
revoke execute on function app.guard_catalog_decision() from public;
--> statement-breakpoint
create trigger catalog_listings_guard_decision
  before update on catalog_listings
  for each row execute function app.guard_catalog_decision();
--> statement-breakpoint
-- A space's slug is its host, so none may take an address the platform keeps. The list is
-- core's RESERVED_SLUGS, and test/db/catalog-fence.test.ts holds this to it. Written here,
-- not in the Drizzle schema, because a generated check would repeat the list in every
-- snapshot. Validated in 0018.
alter table spaces add constraint spaces_slug_not_reserved
  check (lower(slug) not in ('app', 'new', 'www', 'api', 'mail', 'email', 'send', 'admin', 'assets', 'auth', 'billing', 'blog', 'cdn', 'docs', 'help', 'login', 'pay', 'staging', 'static', 'status', 'support')) not valid;
--> statement-breakpoint
-- Anyone may apply, signed in or not. Only what a new application looks like.
create policy creator_applications_insert on creator_applications for insert to lr_app
  with check (status = 'new' and decided_at is null);
--> statement-breakpoint
create policy creator_applications_select on creator_applications for select to lr_app
  using ((select app.is_operator()));
--> statement-breakpoint
create policy creator_applications_decide on creator_applications for update to lr_app
  using ((select app.is_operator()))
  with check ((select app.is_operator()));
--> statement-breakpoint
-- An operator's actions are logged, in the listing's space or in none.
create policy action_log_select_operator on action_log for select to lr_app
  using ((select app.is_operator()));
--> statement-breakpoint
create policy action_log_insert_operator on action_log for insert to lr_app
  with check (actor_user_id = (select app.user_id()) and (select app.is_operator()));
--> statement-breakpoint
-- The new columns go last: create or replace can only add at the end.
create or replace view public_spaces with (security_barrier = true) as
  select id, slug, name, default_locale, locales, tagline, bio, brand_color
    from spaces
   where archived_at is null;
--> statement-breakpoint
-- A snapshot of format 1 has no topic, level or price: the same plain values
-- upcastSnapshot reads it with.
create or replace view public_routes with (security_barrier = true) as
  select route.id as route_id,
         route.space_id,
         space.slug as space_slug,
         version.snapshot #>> '{route,slug}' as slug,
         version.version,
         version.published_at,
         version.snapshot #> '{route,title}' as title,
         version.snapshot #> '{route,description}' as description,
         version.snapshot #>> '{route,sourceLocale}' as source_locale,
         version.snapshot #>> '{route,access}' as access,
         version.snapshot #>> '{route,pricing}' as pricing,
         (
           select coalesce(jsonb_agg(jsonb_build_object(
                    'id', module.value ->> 'id',
                    'title', module.value -> 'title',
                    'lessons', (
                      select coalesce(jsonb_agg(lesson.value -> 'title'
                                                order by lesson.value ->> 'position' collate "C"), '[]'::jsonb)
                        from jsonb_array_elements(version.snapshot -> 'lessons') as lesson
                       where lesson.value ->> 'moduleId' = module.value ->> 'id'
                    )
                  ) order by module.value ->> 'position' collate "C"), '[]'::jsonb)
             from jsonb_array_elements(version.snapshot -> 'modules') as module
         ) as modules,
         jsonb_array_length(version.snapshot -> 'modules') as module_count,
         jsonb_array_length(version.snapshot -> 'lessons') as lesson_count,
         coalesce(version.snapshot #>> '{route,topic}', 'otros') as topic,
         coalesce(version.snapshot #>> '{route,level}', 'inicial') as level,
         (version.snapshot #>> '{route,priceMinor}')::bigint as price_minor,
         version.snapshot #>> '{route,currency}' as currency,
         space.name as space_name
    from routes as route
    join spaces as space on space.id = route.space_id
    join route_versions as version
      on version.route_id = route.id
     and version.space_id = route.space_id
     and version.version = route.latest_published_version
   where route.archived_at is null
     and space.archived_at is null;
--> statement-breakpoint
-- A route the operator approved. A newer version stays listed.
create view public_catalog with (security_barrier = true) as
  select published.*, listing.decided_at as approved_at, listing.featured_position
    from public_routes as published
    join catalog_listings as listing
      on listing.route_id = published.route_id and listing.space_id = published.space_id
   where listing.status = 'approved';
--> statement-breakpoint
grant select on public_spaces, public_routes, public_catalog to lr_public;
