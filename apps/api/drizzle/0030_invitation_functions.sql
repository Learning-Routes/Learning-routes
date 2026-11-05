-- Invitations (Platform STEP 10, pulled forward). The table is closed to lr_app. Each function
-- says who may do what: an operator invites, holding the token shows the invitation, and only
-- the invited address, signed in, can use it. The link's token is kept only as a hash.
alter table public.creator_invitations enable row level security;
--> statement-breakpoint
create function app.invite_applicant(application uuid, new_hash text, expires timestamptz)
  returns table (outcome text, email text, name text, locale text)
  language plpgsql volatile security definer
  set search_path = pg_catalog, public
as $$
declare
  applicant public.creator_applications;
begin
  if not app.is_operator() then
    return query select 'not_found', null::text, null::text, null::text;
    return;
  end if;
  select * into applicant from public.creator_applications as a
   where a.id = application and a.status in ('new', 'invited')
   for update;
  if not found then
    return query select 'not_found', null::text, null::text, null::text;
    return;
  end if;
  -- A new link replaces an old one, so one address never holds two.
  delete from public.creator_invitations as i
   where i.application_id = application and i.used_at is null;
  insert into public.creator_invitations (application_id, token_hash, expires_at)
  values (application, new_hash, expires);
  update public.creator_applications as a
     set status = 'invited', decided_at = now()
   where a.id = application;
  return query select 'ok', applicant.email, applicant.name, applicant.locale;
end;
$$;
--> statement-breakpoint
create function app.invitation_state(sent_hash text)
  returns table (state text, email text, name text, locale text)
  language sql stable security definer
  set search_path = pg_catalog, public
as $$
  select found.state, found.email, found.name, found.locale from (
    select case
             when i.used_at is not null then 'used'
             when i.expires_at <= now() then 'expired'
             else 'ok'
           end as state,
           a.email, a.name, a.locale
      from public.creator_invitations as i
      join public.creator_applications as a on a.id = i.application_id
     where i.token_hash = sent_hash
    union all
    select 'unknown', null, null, null
  ) as found
  limit 1;
$$;
--> statement-breakpoint
create function app.accept_invitation(sent_hash text, new_slug text)
  returns table (outcome text, space_id uuid)
  language plpgsql volatile security definer
  set search_path = pg_catalog, public
as $$
declare
  invitation public.creator_invitations;
  applicant public.creator_applications;
  person public."user";
  created uuid;
begin
  select * into invitation from public.creator_invitations as i
   where i.token_hash = sent_hash and i.used_at is null and i.expires_at > now()
   for update;
  if not found then
    return query select 'not_found', null::uuid;
    return;
  end if;
  select * into applicant from public.creator_applications as a where a.id = invitation.application_id;
  select * into person from public."user" as u where u.id = app.user_id();
  if not found or not person.email_verified or lower(person.email) <> lower(applicant.email) then
    return query select 'not_found', null::uuid;
    return;
  end if;
  insert into public.spaces (slug, name, default_locale, locales)
  values (new_slug, jsonb_build_object(applicant.locale, applicant.name), applicant.locale, array[applicant.locale])
  on conflict (slug) do nothing
  returning id into created;
  if created is null then
    return query select 'slug_taken', null::uuid;
    return;
  end if;
  insert into public.memberships (space_id, user_id, role) values (created, person.id, 'owner');
  update public.creator_invitations as i set used_at = now() where i.id = invitation.id;
  update public.creator_applications as a set status = 'joined' where a.id = applicant.id;
  return query select 'ok', created;
end;
$$;
--> statement-breakpoint
revoke execute on function app.invite_applicant(uuid, text, timestamptz) from public;
--> statement-breakpoint
revoke execute on function app.invitation_state(text) from public;
--> statement-breakpoint
revoke execute on function app.accept_invitation(text, text) from public;
--> statement-breakpoint
-- A refused invitation belongs to no space yet, and its person logs it, as with a connection.
create policy action_log_insert_invitation on action_log for insert to lr_app
  with check (
    actor_user_id = (select app.user_id())
    and space_id is null
    and action = 'invitation.accept'
  );
