-- Route images (Platform STEP 20 §B): each creator sees and writes only their own, and takes one only
-- in a space they build in. The grants are 0047's.
alter table image_generations enable row level security;
--> statement-breakpoint
alter table image_generations force row level security;
--> statement-breakpoint
create policy image_generations_select on image_generations for select to lr_app
  using (user_id = (select app.user_id()));
--> statement-breakpoint
create policy image_generations_insert on image_generations for insert to lr_app
  with check (
    user_id = (select app.user_id())
    and space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[])
  );
--> statement-breakpoint
create policy image_generations_update on image_generations for update to lr_app
  using (user_id = (select app.user_id()))
  with check (user_id = (select app.user_id()));
--> statement-breakpoint
create policy image_generations_delete on image_generations for delete to lr_app
  using (user_id = (select app.user_id()) and made_at is null);
