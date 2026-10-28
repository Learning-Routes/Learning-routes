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
grant select, insert, update on enrollments, progress, cards to lr_app;
--> statement-breakpoint
grant select, insert on reviews, action_log to lr_app;
