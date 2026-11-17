-- lr_app's privileges on the community (Platform STEP 17), table by table and column by column.
-- Safe to run again: the database runbook re-runs it after a restore, right after 0013, whose
-- revoke clears these too. test/db/grants.test.ts holds the same set.
grant select, insert on community_posts to lr_app;
--> statement-breakpoint
-- Creators pin, answer and hide; an author deletes, which empties the text and the name.
grant update (is_pinned, is_answer, hidden_at, hidden_by, deleted_at, body, author_name)
  on community_posts to lr_app;
--> statement-breakpoint
grant select, insert, delete on community_reactions to lr_app;
--> statement-breakpoint
grant select, insert on community_reports to lr_app;
--> statement-breakpoint
grant update (resolved_at, resolved_by) on community_reports to lr_app;
--> statement-breakpoint
grant select, insert, delete on community_follows to lr_app;
--> statement-breakpoint
grant select, insert, delete on community_blocks to lr_app;
--> statement-breakpoint
grant select, insert, delete on community_bans to lr_app;
--> statement-breakpoint
-- Notifications are written by a trigger; a person only marks their own read.
grant select on notifications to lr_app;
--> statement-breakpoint
grant update (read_at) on notifications to lr_app;
--> statement-breakpoint
grant execute on function app.community_route_ids() to lr_app;
--> statement-breakpoint
grant execute on function app.followed_space_ids() to lr_app;
--> statement-breakpoint
grant execute on function app.is_community_banned() to lr_app;
--> statement-breakpoint
grant execute on function app.community_reply_allowed(uuid, uuid) to lr_app;
--> statement-breakpoint
grant execute on function app.is_live_space(uuid) to lr_app;
--> statement-breakpoint
grant execute on function app.published_route_titles(uuid[]) to lr_app;
--> statement-breakpoint
-- A stranger reads how many follow a space, and nothing else of the community.
grant select on public_space_followers to lr_public;
