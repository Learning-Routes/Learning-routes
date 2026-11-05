-- Safe to run again: the database runbook re-runs it after a restore, after 0013's revoke.
grant execute on function app.invite_applicant(uuid, text, timestamptz) to lr_app;
--> statement-breakpoint
grant execute on function app.invitation_state(text) to lr_app;
--> statement-breakpoint
grant execute on function app.accept_invitation(text, text) to lr_app;
