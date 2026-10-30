-- Shared checks for localized text and locale lists (Platform STEP 2 §2), in the
-- app schema. They accept exactly what core's LocalizedText and Locale accept; a
-- test runs the same samples through both. The locale list mirrors core's LOCALES.
create function app.is_localized(value jsonb) returns boolean
  language sql immutable parallel safe
  return jsonb_typeof(value) = 'object'
    and value <> '{}'::jsonb
    and (
      select bool_and(key = any (array['es', 'en', 'pt', 'fr', 'it']) and jsonb_typeof(value -> key) = 'string')
        from jsonb_object_keys(value) as key
    );
--> statement-breakpoint
create function app.is_locale_list(locales text[]) returns boolean
  language sql immutable parallel safe
  return cardinality(locales) > 0
    and locales <@ array['es', 'en', 'pt', 'fr', 'it']
    and cardinality(locales) = (select count(distinct locale) from unnest(locales) as locale);
--> statement-breakpoint
-- Better Auth's tables: the auth module reads and writes them as lr_app. No RLS.
grant select, insert, update, delete on "user", session, account, verification, rate_limit to lr_app;
