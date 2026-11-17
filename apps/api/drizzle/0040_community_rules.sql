-- The second fence for a route's community (Platform STEP 17). It holds core's lines without
-- relying on them: a route's community is read and written by whoever holds an active enrollment
-- in it and by its space's creators; to anyone else it does not exist. Helpers are security
-- definer with a pinned search_path, so no policy reads the table it guards.

-- The routes whose community the acting user may read and write: their active enrollments, and
-- the published routes of the spaces they create in.
create function app.community_route_ids() returns uuid[]
  language sql stable security definer
  set search_path = pg_catalog, public
  return array(
    select enrollment.route_id from public.enrollments as enrollment
     where enrollment.user_id = app.user_id() and enrollment.status = 'active'
    union
    select route.id from public.routes as route
     where route.space_id = any (app.member_space_ids('{owner,coeditor}'))
       and route.latest_published_version is not null
  );
--> statement-breakpoint
revoke execute on function app.community_route_ids() from public;
--> statement-breakpoint
create function app.followed_space_ids() returns uuid[]
  language sql stable security definer
  set search_path = pg_catalog, public
  return array(
    select follow.space_id from public.community_follows as follow where follow.user_id = app.user_id()
  );
--> statement-breakpoint
revoke execute on function app.followed_space_ids() from public;
--> statement-breakpoint
create function app.is_community_banned() returns boolean
  language sql stable security definer
  set search_path = pg_catalog, public
  return exists (select 1 from public.community_bans as ban where ban.user_id = app.user_id());
--> statement-breakpoint
revoke execute on function app.is_community_banned() from public;
--> statement-breakpoint
-- A reply goes to a live post of the same route, one level deep, whose author has not blocked
-- the replier.
create function app.community_reply_allowed(parent uuid, route uuid) returns boolean
  language sql stable security definer
  set search_path = pg_catalog, public
  return exists (
    select 1 from public.community_posts as post
     where post.id = parent and post.route_id = route and post.parent_id is null
       and post.deleted_at is null and post.kind <> 'milestone'
       and not exists (
         select 1 from public.community_blocks as block
          where block.user_id = post.author_id and block.blocked_user_id = app.user_id()
       )
  );
--> statement-breakpoint
revoke execute on function app.community_reply_allowed(uuid, uuid) from public;
--> statement-breakpoint
create function app.is_live_space(space uuid) returns boolean
  language sql stable security definer
  set search_path = pg_catalog, public
  return exists (select 1 from public.spaces where id = space and archived_at is null);
--> statement-breakpoint
revoke execute on function app.is_live_space(uuid) from public;
--> statement-breakpoint
-- A feed's route titles: the published title of a live route, which public_routes shows any
-- stranger, so a follower who is not enrolled still reads which route a post is in.
create function app.published_route_titles(ids uuid[]) returns table (route_id uuid, title jsonb)
  language sql stable security definer
  set search_path = pg_catalog, public
as $$
  select route.id, version.snapshot #> '{route,title}'
    from public.routes as route
    join public.spaces as space on space.id = route.space_id
    join public.route_versions as version
      on version.route_id = route.id and version.space_id = route.space_id
     and version.version = route.latest_published_version
   where route.id = any (ids) and route.archived_at is null and space.archived_at is null
$$;
--> statement-breakpoint
revoke execute on function app.published_route_titles(uuid[]) from public;
--> statement-breakpoint
alter table community_posts enable row level security;
--> statement-breakpoint
alter table community_posts force row level security;
--> statement-breakpoint
alter table community_reactions enable row level security;
--> statement-breakpoint
alter table community_reactions force row level security;
--> statement-breakpoint
alter table community_reports enable row level security;
--> statement-breakpoint
alter table community_reports force row level security;
--> statement-breakpoint
alter table community_follows enable row level security;
--> statement-breakpoint
alter table community_follows force row level security;
--> statement-breakpoint
alter table community_blocks enable row level security;
--> statement-breakpoint
alter table community_blocks force row level security;
--> statement-breakpoint
alter table community_bans enable row level security;
--> statement-breakpoint
alter table community_bans force row level security;
--> statement-breakpoint
alter table notifications enable row level security;
--> statement-breakpoint
alter table notifications force row level security;
--> statement-breakpoint
-- A hidden item is seen by its author and the route's creators; a follower sees the creators'
-- own live posts in the spaces they follow; the operator sees everything.
create policy community_posts_select on community_posts for select to lr_app
  using (
    (
      route_id = any ((select app.community_route_ids())::uuid[])
      and (
        hidden_at is null
        or author_id = (select app.user_id())
        or space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[])
      )
    )
    or (
      is_by_creator and parent_id is null and hidden_at is null and deleted_at is null
      and space_id = any ((select app.followed_space_ids())::uuid[])
    )
    or (select app.is_operator())
  );
--> statement-breakpoint
create policy community_posts_insert on community_posts for insert to lr_app
  with check (
    author_id = (select app.user_id())
    and not (select app.is_community_banned())
    and route_id = any ((select app.community_route_ids())::uuid[])
    and is_by_creator = (space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[]))
    and not is_pinned and not is_answer
    and hidden_at is null and hidden_by is null and deleted_at is null
    and (parent_id is null or app.community_reply_allowed(parent_id, route_id))
    and (
      kind is distinct from 'milestone'
      or exists (
        select 1 from user_profiles as profile
         where profile.user_id = (select app.user_id()) and profile.is_sharing_milestones
      )
    )
  );
--> statement-breakpoint
create policy community_posts_update_author on community_posts for update to lr_app
  using (author_id = (select app.user_id()))
  with check (author_id = (select app.user_id()));
--> statement-breakpoint
create policy community_posts_update_creator on community_posts for update to lr_app
  using (space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[]))
  with check (space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[]));
--> statement-breakpoint
create policy community_posts_update_operator on community_posts for update to lr_app
  using ((select app.is_operator()))
  with check ((select app.is_operator()));
--> statement-breakpoint
-- The policies say who may update a row, not which columns. What a post says and whose it is
-- never changes; only creators and the operator pin, answer and hide; an author only deletes
-- their own, which empties it. Only lr_app is held: the migrator, which erases, acts for no one.
create function app.guard_community_post() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if current_user <> 'lr_app' then
    return new;
  end if;
  if (new.id, new.space_id, new.route_id, new.parent_id, new.author_id, new.kind, new.lesson_id,
      new.module_number, new.is_by_creator, new.created_at)
     is distinct from
     (old.id, old.space_id, old.route_id, old.parent_id, old.author_id, old.kind, old.lesson_id,
      old.module_number, old.is_by_creator, old.created_at)
  then
    raise exception 'a post''s place and author never change' using errcode = 'insufficient_privilege';
  end if;
  if (new.is_pinned, new.is_answer, new.hidden_at, new.hidden_by)
       is distinct from (old.is_pinned, old.is_answer, old.hidden_at, old.hidden_by)
     and not (app.is_operator() or new.space_id = any (app.member_space_ids('{owner,coeditor}')))
  then
    raise exception 'only a creator pins, answers and hides' using errcode = 'insufficient_privilege';
  end if;
  if (new.body, new.author_name, new.deleted_at) is distinct from (old.body, old.author_name, old.deleted_at)
     and not (
       old.author_id = app.user_id() and old.deleted_at is null and new.deleted_at is not null
       and new.body is null and new.author_name = ''
     )
  then
    raise exception 'only its author deletes a post, and nobody edits one' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
--> statement-breakpoint
revoke execute on function app.guard_community_post() from public;
--> statement-breakpoint
create trigger community_posts_guard
  before update on community_posts
  for each row execute function app.guard_community_post();
--> statement-breakpoint
-- One answer per post. The table is new and empty (0039, the same deploy): nothing waits on it.
-- squawk-ignore require-concurrent-index-creation
create unique index community_posts_one_answer_key on community_posts (parent_id) where is_answer;
--> statement-breakpoint
-- In-app notifications, written here so no one writes another person's: a reply to your post,
-- your reply marked as the answer, your post pinned. Never your own doing, and never from
-- someone you blocked.
create function app.community_notify() returns trigger
  language plpgsql security definer
  set search_path = pg_catalog, public
as $$
declare
  target uuid;
begin
  if tg_op = 'INSERT' and new.parent_id is not null then
    select post.author_id into target from public.community_posts as post where post.id = new.parent_id;
    if target is not null and target is distinct from new.author_id and not exists (
      select 1 from public.community_blocks as block
       where block.user_id = target and block.blocked_user_id = new.author_id
    ) then
      insert into public.notifications (user_id, space_id, post_id, kind)
        values (target, new.space_id, new.parent_id, 'reply');
    end if;
  elsif tg_op = 'UPDATE' and new.author_id is not null and new.author_id is distinct from app.user_id() then
    if new.is_pinned and not old.is_pinned then
      insert into public.notifications (user_id, space_id, post_id, kind)
        values (new.author_id, new.space_id, new.id, 'pinned');
    end if;
    if new.is_answer and not old.is_answer then
      insert into public.notifications (user_id, space_id, post_id, kind)
        values (new.author_id, new.space_id, new.parent_id, 'answer');
    end if;
  end if;
  return null;
end;
$$;
--> statement-breakpoint
revoke execute on function app.community_notify() from public;
--> statement-breakpoint
create trigger community_posts_notify
  after insert or update of is_pinned, is_answer on community_posts
  for each row execute function app.community_notify();
--> statement-breakpoint
create policy community_reactions_select on community_reactions for select to lr_app
  using (exists (select 1 from community_posts as post where post.id = post_id));
--> statement-breakpoint
create policy community_reactions_insert on community_reactions for insert to lr_app
  with check (
    user_id = (select app.user_id())
    and exists (
      select 1 from community_posts as post
       where post.id = post_id and post.space_id = community_reactions.space_id
    )
  );
--> statement-breakpoint
create policy community_reactions_delete on community_reactions for delete to lr_app
  using (user_id = (select app.user_id()));
--> statement-breakpoint
create policy community_reports_select on community_reports for select to lr_app
  using (
    user_id = (select app.user_id())
    or space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[])
    or (select app.is_operator())
  );
--> statement-breakpoint
-- Anyone who can read an item can report it, once.
create policy community_reports_insert on community_reports for insert to lr_app
  with check (
    user_id = (select app.user_id())
    and resolved_at is null and resolved_by is null
    and exists (
      select 1 from community_posts as post
       where post.id = post_id and post.space_id = community_reports.space_id
    )
  );
--> statement-breakpoint
create policy community_reports_resolve on community_reports for update to lr_app
  using (
    space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[])
    or (select app.is_operator())
  )
  with check (
    space_id = any ((select app.member_space_ids('{owner,coeditor}'))::uuid[])
    or (select app.is_operator())
  );
--> statement-breakpoint
-- Three different people's open reports hide an item until a creator or the operator reviews it.
create function app.community_hide_reported() returns trigger
  language plpgsql security definer
  set search_path = pg_catalog, public
as $$
begin
  if (select count(*) from public.community_reports as report
       where report.post_id = new.post_id and report.resolved_at is null) >= 3 then
    update public.community_posts set hidden_at = now()
     where id = new.post_id and hidden_at is null;
  end if;
  return null;
end;
$$;
--> statement-breakpoint
revoke execute on function app.community_hide_reported() from public;
--> statement-breakpoint
create trigger community_reports_hide
  after insert on community_reports
  for each row execute function app.community_hide_reported();
--> statement-breakpoint
create policy community_follows_select on community_follows for select to lr_app
  using (user_id = (select app.user_id()));
--> statement-breakpoint
create policy community_follows_insert on community_follows for insert to lr_app
  with check (user_id = (select app.user_id()) and app.is_live_space(space_id));
--> statement-breakpoint
create policy community_follows_delete on community_follows for delete to lr_app
  using (user_id = (select app.user_id()));
--> statement-breakpoint
create policy community_blocks_select on community_blocks for select to lr_app
  using (user_id = (select app.user_id()));
--> statement-breakpoint
create policy community_blocks_insert on community_blocks for insert to lr_app
  with check (user_id = (select app.user_id()));
--> statement-breakpoint
create policy community_blocks_delete on community_blocks for delete to lr_app
  using (user_id = (select app.user_id()));
--> statement-breakpoint
create policy community_bans_select on community_bans for select to lr_app
  using (user_id = (select app.user_id()) or (select app.is_operator()));
--> statement-breakpoint
create policy community_bans_insert on community_bans for insert to lr_app
  with check ((select app.is_operator()) and banned_by = (select app.user_id()));
--> statement-breakpoint
create policy community_bans_delete on community_bans for delete to lr_app
  using ((select app.is_operator()));
--> statement-breakpoint
create policy notifications_select on notifications for select to lr_app
  using (user_id = (select app.user_id()));
--> statement-breakpoint
create policy notifications_update on notifications for update to lr_app
  using (user_id = (select app.user_id()))
  with check (user_id = (select app.user_id()));
--> statement-breakpoint
-- A person logs what they do with their own account in the community, in no space.
create policy action_log_insert_community on action_log for insert to lr_app
  with check (
    actor_user_id = (select app.user_id())
    and space_id is null
    and action in ('community.follow', 'community.block', 'notification.read', 'profile.update')
  );
--> statement-breakpoint
-- What a stranger may know about who follows a space: how many, never who. Runs as its owner, so
-- lr_public needs nothing on community_follows.
create view public_space_followers with (security_barrier = true) as
  select space.id as space_id, count(follow.user_id)::integer as followers
    from spaces as space
    left join community_follows as follow on follow.space_id = space.id
   where space.archived_at is null
   group by space.id;
