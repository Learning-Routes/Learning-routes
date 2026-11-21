-- The learner's tutor's questions (Platform STEP 20 §A): each person sees and writes only their own,
-- on their own enrollment (the foreign key holds the enrollment's person). The grants are 0044's.
alter table tutor_questions enable row level security;
--> statement-breakpoint
alter table tutor_questions force row level security;
--> statement-breakpoint
create policy tutor_questions_select on tutor_questions for select to lr_app
  using (user_id = (select app.user_id()));
--> statement-breakpoint
create policy tutor_questions_insert on tutor_questions for insert to lr_app
  with check (user_id = (select app.user_id()));
--> statement-breakpoint
create policy tutor_questions_update on tutor_questions for update to lr_app
  using (user_id = (select app.user_id()))
  with check (user_id = (select app.user_id()));
--> statement-breakpoint
create policy tutor_questions_delete on tutor_questions for delete to lr_app
  using (user_id = (select app.user_id()) and answered_at is null);
