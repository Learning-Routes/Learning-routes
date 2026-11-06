-- Safe to run again: the database runbook re-runs it after a restore, after 0013's revoke.
grant select, insert on stored_files to lr_app;
