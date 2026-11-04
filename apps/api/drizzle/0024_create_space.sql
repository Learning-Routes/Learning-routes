-- space.create (Platform STEP 5 §1). Security definer, so lr_app gets no INSERT on spaces,
-- and an operator, who belongs to no space, can still add the first owner. It checks who is
-- asking itself, and reads the address's account here: "signed in" is a verified address.
-- Both rows land together, or neither does.
create function app.create_space(new_slug text, new_name jsonb, new_locale text, owner_email text)
  returns table (outcome text, space_id uuid)
  language plpgsql volatile security definer
  set search_path = pg_catalog, public
as $$
declare
  owner_id uuid;
  created uuid;
begin
  if not app.is_operator() then
    return query select 'not_found', null::uuid;
    return;
  end if;
  select account.id into owner_id from public."user" as account
   where lower(account.email) = lower(owner_email) and account.email_verified;
  if not found then
    return query select 'no_account', null::uuid;
    return;
  end if;
  insert into public.spaces (slug, name, default_locale, locales)
  values (new_slug, new_name, new_locale, array[new_locale])
  on conflict (slug) do nothing
  returning id into created;
  if created is null then
    return query select 'slug_taken', null::uuid;
    return;
  end if;
  insert into public.memberships (space_id, user_id, role) values (created, owner_id, 'owner');
  return query select 'ok', created;
end;
$$;
--> statement-breakpoint
revoke execute on function app.create_space(text, jsonb, text, text) from public;
