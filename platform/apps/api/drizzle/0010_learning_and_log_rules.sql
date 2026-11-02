-- reviews and action_log are append-only (Platform STEP 2 §2.14, §2.15): lr_app may
-- only select and insert, and triggers refuse an update, delete or truncate to
-- every role.
create trigger reviews_append_only
  before update or delete on reviews
  for each row execute function app.refuse_change();
--> statement-breakpoint
create trigger reviews_no_truncate
  before truncate on reviews
  for each statement execute function app.refuse_change();
--> statement-breakpoint
create trigger action_log_append_only
  before update or delete on action_log
  for each row execute function app.refuse_change();
--> statement-breakpoint
create trigger action_log_no_truncate
  before truncate on action_log
  for each statement execute function app.refuse_change();
--> statement-breakpoint
-- An enrollment is made by app.enroll and changed by app.upgrade_enrollment and
-- app.set_enrollment_status (§3), all security definer: lr_app only reads it.
grant select on enrollments to lr_app;
--> statement-breakpoint
-- A student's progress and cards: never whose they are, or where.
grant select, insert on progress, cards to lr_app;
--> statement-breakpoint
grant update (status, completed_at, blocks, updated_at) on progress to lr_app;
--> statement-breakpoint
grant update (state, reps, lapses, stability, difficulty, last_review_at, due_at, fsrs_params_version, updated_at)
  on cards to lr_app;
--> statement-breakpoint
-- An upgrade moves the pinned version forward, never back or in place.
create function app.pin_forward() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if new.pinned_version <= old.pinned_version then
    raise exception 'the pinned version only moves forward' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
--> statement-breakpoint
create trigger enrollments_pin_forward
  before update of pinned_version on enrollments
  for each row execute function app.pin_forward();
--> statement-breakpoint
grant select, insert on reviews, action_log to lr_app;
