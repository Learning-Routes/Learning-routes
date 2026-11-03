-- Safe to run again: the database runbook re-runs it after a restore, after 0013's revoke.
grant execute on function app.create_space(text, jsonb, text, text) to lr_app;
