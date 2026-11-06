-- 0034 added the interactive kind NOT VALID; this validates it.
alter table blocks validate constraint blocks_kind;
--> statement-breakpoint
-- A space's files (Platform STEP 9 §2): its staff see them, its editors keep new ones, and
-- nobody changes or removes one. Both fences: core's permission table holds the same lines.
alter table stored_files enable row level security;
--> statement-breakpoint
alter table stored_files force row level security;
--> statement-breakpoint
create policy stored_files_select on stored_files for select to lr_app
  using (space_id = any ((select app.member_space_ids('{owner,coeditor,assistant}'))::uuid[]));
--> statement-breakpoint
create policy stored_files_insert on stored_files for insert to lr_app
  with check (space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[]));
--> statement-breakpoint
-- Safe to run again: the database runbook re-runs it after a restore.
grant select, insert on stored_files to lr_app;
