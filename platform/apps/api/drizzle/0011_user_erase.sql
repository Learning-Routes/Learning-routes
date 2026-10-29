-- user.erase (Platform STEP 2 §2.16). reviews stay append-only, except that the
-- erase path, which sets app.erasing_user_id in its own transaction, may remove
-- that one user's reviews as the user row's delete cascades. lr_app has no delete
-- on reviews, and no delete on "user": only the migrator erases a user.
create function app.refuse_change_unless_erasing() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' and old.user_id = nullif(current_setting('app.erasing_user_id', true), '')::uuid then
    return old;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = 'restrict_violation';
end;
$$;
--> statement-breakpoint
drop trigger reviews_append_only on reviews;
--> statement-breakpoint
create trigger reviews_append_only
  before update or delete on reviews
  for each row execute function app.refuse_change_unless_erasing();
--> statement-breakpoint
revoke delete on "user" from lr_app;
