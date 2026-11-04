-- lr_app's whole set of privileges, in one file (Platform STEP 2 review, item 6).
-- It revokes everything first and then grants exactly this, so it is safe to run
-- again: the database runbook re-runs it after a restore. test/db/grants.test.ts
-- holds the same set and is the source of truth. Earlier migrations granted the
-- same privileges as each table arrived.
revoke all on all tables in schema public from lr_app;
--> statement-breakpoint
revoke all on all functions in schema app from lr_app;
--> statement-breakpoint
grant usage on schema app to lr_app;
--> statement-breakpoint
grant usage on schema public to lr_app;
--> statement-breakpoint
-- Better Auth's tables, used only by src/auth/. Only user.erase, as the migrator,
-- deletes a user.
grant select, insert, update, delete on session, account, verification, rate_limit to lr_app;
--> statement-breakpoint
grant select, insert, update on "user" to lr_app;
--> statement-breakpoint
-- Tenancy. A space and its first owner are made by the seed, as the migrator.
grant select, insert, update on user_profiles to lr_app;
--> statement-breakpoint
grant select, update on spaces to lr_app;
--> statement-breakpoint
grant select, insert on memberships to lr_app;
--> statement-breakpoint
grant select on platform_roles to lr_app;
--> statement-breakpoint
-- A route's draft: archived, never deleted; updated column by column.
grant select, insert on routes, modules, lessons, blocks to lr_app;
--> statement-breakpoint
grant update (slug, title, description, source_locale, access, pricing, updated_at, archived_at)
  on routes to lr_app;
--> statement-breakpoint
grant update (position, title, updated_at, archived_at) on modules, lessons to lr_app;
--> statement-breakpoint
grant update (position, kind, data, updated_at, archived_at) on blocks to lr_app;
--> statement-breakpoint
grant select, insert, delete on lesson_prerequisites to lr_app;
--> statement-breakpoint
-- Append-only, enforced by triggers too.
grant select, insert on route_versions, reviews, action_log to lr_app;
--> statement-breakpoint
-- Learning: enrollments change only through the functions below.
grant select on enrollments to lr_app;
--> statement-breakpoint
grant select, insert on progress, cards to lr_app;
--> statement-breakpoint
grant update (status, completed_at, blocks, updated_at) on progress to lr_app;
--> statement-breakpoint
grant update (state, reps, lapses, stability, difficulty, last_review_at, due_at, fsrs_params_version, updated_at)
  on cards to lr_app;
--> statement-breakpoint
-- The security definer functions, each checking the acting user itself.
grant execute on function app.member_space_ids(text[]) to lr_app;
--> statement-breakpoint
grant execute on function app.enroll(uuid) to lr_app;
--> statement-breakpoint
grant execute on function app.upgrade_enrollment(uuid) to lr_app;
--> statement-breakpoint
grant execute on function app.set_enrollment_status(uuid, text) to lr_app;
--> statement-breakpoint
grant execute on function app.bump_draft(uuid, uuid, bigint) to lr_app;
--> statement-breakpoint
grant execute on function app.mark_published(uuid, uuid, integer) to lr_app;
