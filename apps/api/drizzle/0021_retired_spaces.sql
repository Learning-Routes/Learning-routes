-- A space that is gone answers 410, where a slug that never was answers 404 (Platform
-- STEP 4 §5.1). The slug, and nothing else about it.
create view public_retired_spaces with (security_barrier = true) as
  select slug from spaces where archived_at is not null;
--> statement-breakpoint
grant select on public_retired_spaces to lr_public;
