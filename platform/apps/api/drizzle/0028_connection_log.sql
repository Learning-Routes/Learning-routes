-- A connection belongs to an account, not to a space (Platform STEP 5 §2): a person logs their
-- own connecting and disconnecting, in no space, and nothing else may be logged that way.
create policy action_log_insert_connection on action_log for insert to lr_app
  with check (
    actor_user_id = (select app.user_id())
    and space_id is null
    and action in ('connection.grant', 'connection.revoke')
  );
