-- What a stranger may see (Platform STEP 4 §1). Each view is a security barrier and
-- runs as its owner, the migrator, so lr_public needs no privilege on any table and
-- row-level security never has to know about it. A view names its columns: a new
-- column on a table, or a new field in a snapshot, stays private until a view says so.
-- Never a block: a snapshot's blocks hold the lessons and their answers.
create view public_spaces with (security_barrier = true) as
  select id, slug, name, default_locale, locales
    from spaces
   where archived_at is null;
--> statement-breakpoint
-- The latest published version of each live route, read from its frozen snapshot, so
-- an edit nobody published never shows.
create view public_routes with (security_barrier = true) as
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
         jsonb_array_length(version.snapshot -> 'lessons') as lesson_count
    from routes as route
    join spaces as space on space.id = route.space_id
    join route_versions as version
      on version.route_id = route.id
     and version.space_id = route.space_id
     and version.version = route.latest_published_version
   where route.archived_at is null
     and space.archived_at is null;
--> statement-breakpoint
-- lr_public's whole set of privileges. Safe to run again: the database runbook
-- re-runs this file after a restore, with 0013. test/db/public-reads.test.ts holds it.
revoke all on all tables in schema public from lr_public;
--> statement-breakpoint
grant usage on schema public to lr_public;
--> statement-breakpoint
grant select on public_spaces, public_routes to lr_public;
