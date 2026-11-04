-- The catalog's search (Platform STEP 4 §3.2): pg_trgm on the title in the page's
-- locale, through one view column per locale. No lock worth a concurrent build here:
-- route_versions is small, and this runs before the platform takes traffic.
create extension if not exists pg_trgm;
--> statement-breakpoint
-- squawk-ignore require-concurrent-index-creation
create index route_versions_title_es_trgm_idx on route_versions using gin ((snapshot #>> '{route,title,es}') gin_trgm_ops);
--> statement-breakpoint
-- squawk-ignore require-concurrent-index-creation
create index route_versions_title_en_trgm_idx on route_versions using gin ((snapshot #>> '{route,title,en}') gin_trgm_ops);
--> statement-breakpoint
-- squawk-ignore require-concurrent-index-creation
create index route_versions_title_pt_trgm_idx on route_versions using gin ((snapshot #>> '{route,title,pt}') gin_trgm_ops);
--> statement-breakpoint
-- squawk-ignore require-concurrent-index-creation
create index route_versions_title_fr_trgm_idx on route_versions using gin ((snapshot #>> '{route,title,fr}') gin_trgm_ops);
--> statement-breakpoint
-- squawk-ignore require-concurrent-index-creation
create index route_versions_title_it_trgm_idx on route_versions using gin ((snapshot #>> '{route,title,it}') gin_trgm_ops);
--> statement-breakpoint
-- public_catalog selects public_routes.*, which fixed its columns when it was made, so
-- it goes first. Nothing outside the role's own reads depends on either.
-- squawk-ignore ban-drop-view
drop view public_catalog;
--> statement-breakpoint
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
         space.name as space_name,
         space.brand_color as space_brand_color,
         version.snapshot #>> '{route,title,es}' as title_es,
         version.snapshot #>> '{route,title,en}' as title_en,
         version.snapshot #>> '{route,title,pt}' as title_pt,
         version.snapshot #>> '{route,title,fr}' as title_fr,
         version.snapshot #>> '{route,title,it}' as title_it
    from routes as route
    join spaces as space on space.id = route.space_id
    join route_versions as version
      on version.route_id = route.id
     and version.space_id = route.space_id
     and version.version = route.latest_published_version
   where route.archived_at is null
     and space.archived_at is null;
--> statement-breakpoint
create view public_catalog with (security_barrier = true) as
  select published.*, listing.decided_at as approved_at, listing.featured_position
    from public_routes as published
    join catalog_listings as listing
      on listing.route_id = published.route_id and listing.space_id = published.space_id
   where listing.status = 'approved';
--> statement-breakpoint
grant select on public_spaces, public_routes, public_catalog to lr_public;
