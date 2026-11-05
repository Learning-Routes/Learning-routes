# Runbook: the platform's database

The owner's steps to put the platform's database into service after Platform STEP 2 is merged. Each numbered step is one action, done once, in order.

**Secrets never reach the shell history or a file.** Each is kept in the macOS Keychain and read with `$(security find-generic-password -s <name> -w)`, so the history holds the command, never the value. While a command runs, the value is in that process's arguments, visible to `ps` on this Mac. Run these steps on your own machine, with no one else signed in to it. To save a secret, put `-w` last with no value, so the Keychain prompts for it:

```sh
security add-generic-password -a "$USER" -s lr-migrator -w
```

The Keychain items this runbook uses:

| Item | Holds |
|---|---|
| `lr-migrator` | The migrator's connection URL: PlanetScale's default role, which runs migrations and the seed |
| `lr-app` | The Worker's connection URL: the `lr_app` role, which Hyperdrive connects as |
| `lr-public` | The storefront's connection URL: the `lr_public` role, which reads the public views and nothing else |

## The plan we run on

- **Size:** a single-node PS-5 ($5 a month), Postgres 18, in AWS us-east-1. São Paulo doesn't sell this size.
- **Backups:** PlanetScale backs up every 12 hours and keeps each backup for 2 days. Point-in-time recovery runs from the oldest backup to 5 minutes ago.
- **Upgrade to 3 nodes (PS-5 HA, $15 a month) before the first paid student, in Platform STEP 9.** On the Clusters page, choose "HA Primary + Multi-replica", then "Queue instance changes" and "Apply changes". No migration is needed. A single node is what PlanetScale suggests for non-critical workloads, and it has no replica to fail over to.
- **Never** run tests against production, or seed it.

## Before you start

- Platform STEP 2 is merged, and `main` is green.
- You can sign in to PlanetScale and to Cloudflare (`pnpm --filter @learning-routes/api exec wrangler login`).
- In ``, `pnpm install` has run.

## Steps

1. **Create the database.** In PlanetScale, create a **Postgres** database (not Vitess) on Postgres 18, in **AWS us-east-1**. That's the region the API Worker's placement hint names in `apps/api/wrangler.jsonc`. If you choose another region, change the hint to match in the same pull request as step 5. PlanetScale lists its AWS regions at <https://planetscale.com/docs/plans/regions>. Then save the default role's connection URL, on port 5432 (direct, not PgBouncer):

   ```sh
   security add-generic-password -a "$USER" -s lr-migrator -w
   ```

2. **Create the Worker's role, `lr_app`, with SQL.** PlanetScale's docs don't say whether a dashboard role can be made with no inherited role. Its CLI's `--inherited-roles` has no documented empty default. A SQL role is exactly what the migrations expect: it inherits nothing, owns nothing and bypasses nothing. PlanetScale's docs say a role made with SQL doesn't show in the dashboard, so manage it with `psql` from now on.

   ```sh
   psql "$(security find-generic-password -s lr-migrator -w)" -c "create role lr_app login noinherit"
   psql "$(security find-generic-password -s lr-migrator -w)" -c "grant connect on database postgres to lr_app; grant usage on schema public to lr_app"
   psql "$(security find-generic-password -s lr-migrator -w)"
   ```

   In the last `psql` session, type `\password lr_app`. It prompts for the password twice and never echoes it. Then close the gaps PUBLIC leaves open on a new database, which the local role script closes too, and `\q`:

   ```sql
   revoke create on schema public from public;
   revoke temporary on database postgres from public;
   ```

   (`postgres` is the database name in PlanetScale's URL; use yours if it differs.)

   Save `lr_app`'s URL in the Keychain. Like the migrator's, it uses port 5432, the direct connection: Hyperdrive pools connections itself, and pooling on top of PgBouncer is what Cloudflare advises against. Its user name carries the branch id, as PlanetScale requires (`lr_app.<branch-id>`).

   ```sh
   security add-generic-password -U -a "$USER" -s lr-app -w
   ```

   `-U` replaces the item if it is already there, so this step can run again during a restore.

   Check that the role connects and can do nothing yet:

   ```sh
   psql "$(security find-generic-password -s lr-app -w)" -c "select current_user, has_schema_privilege('public', 'create')"
   ```

   It should answer `lr_app | f`. The grants table by table come with the migrations in step 3. Never grant `lr_app` `pg_read_all_data` or `pg_write_all_data`: a later revoke on one table can't take those back.

   **Not done in production:** the local role script's `grant lr_app to lr_migrator`. It's there only so the tests can act as `lr_app`.

3. **Run the migrations** as the default role, over the direct connection. First check that role bypasses row-level security, as PlanetScale's docs say it does. The migrations and the seed in step 9 rely on it, since the policies are written for `lr_app` alone:

   ```sh
   psql "$(security find-generic-password -s lr-migrator -w)" -c "select rolbypassrls from pg_roles where rolname = current_user"
   ```

   It must answer `t`. If it answers `f`, stop and send the output. Then:

   ```sh
   DATABASE_URL_MIGRATOR="$(security find-generic-password -s lr-migrator -w)" pnpm --filter @learning-routes/api db:migrate
   ```

   It prints the migrations it applied. Run it again: it should apply nothing.

   **This is also the first check that PlanetScale accepts the security-definer functions and the row-level security** (`app.member_space_ids`, `app.enroll`, the policies). The docs claim the full Postgres feature set but don't mention these. If a migration fails here, stop and send the error. The fallback is described in the pull request for §3.

4. **Create the Hyperdrive config,** with caching off, so a session or a permission is never served from a cache:

   ```sh
   pnpm --filter @learning-routes/api exec wrangler hyperdrive create lr-db \
     --connection-string="$(security find-generic-password -s lr-app -w)" \
     --caching-disabled --sslmode verify-full --origin-connection-limit 20
   ```

   - **The connection limit** is Hyperdrive's soft cap on connections to the database. Its minimum is 5, and its maximum is about 100 on a paid plan. Keep it below the share of PlanetScale's `max_connections` you want the Worker to use, which depends on the cluster's size.
   - **If `verify-full` fails** with a certificate error: Cloudflare's docs pair it with a CA you upload (`pnpm --filter @learning-routes/api exec wrangler cert upload certificate-authority`), passed with `--ca-certificate-id`. Neither side documents which CA PlanetScale's certificate chains to. If you have to upload one, record which in this runbook.
   - **Also unconfirmed:** neither side's docs say whether a role made with SQL can connect through Hyperdrive. Step 7 checks it.

5. **Put the config's id in `apps/api/wrangler.jsonc`.** Replace the placeholder `id` under `hyperdrive` with the one step 4 printed, in a small pull request. The id isn't a secret.

6. **Set the auth secret.** Make one and copy it, set it from the clipboard at wrangler's prompt (which also offers to create the Worker on a first setup), then clear the clipboard:

   ```sh
   openssl rand -base64 32 | pbcopy
   pnpm --filter @learning-routes/api exec wrangler secret put BETTER_AUTH_SECRET
   pbcopy < /dev/null
   ```

   Paste at the prompt. The value is never printed or saved. The app origin isn't a secret: it's `APP_ORIGIN` in `apps/api/wrangler.jsonc` (`https://app.learningroutes.com`). Change it there if the app moves.

7. **Deploy the Workers, and check.** No workflow deploys the platform yet, so deploy by hand from `main`, API first, since the web Worker binds to it:

   ```sh
   git switch main && git pull
   pnpm --filter @learning-routes/api exec wrangler deploy
   pnpm --filter @learning-routes/api exec wrangler deploy --config wrangler.mcp.jsonc
   pnpm --filter @learning-routes/web build
   pnpm --filter @learning-routes/web exec wrangler deploy
   pnpm smoke:prod
   ```

   The web Worker's `routes` take the apex, `www` and `app` as custom domains, and every other host through the route `*.learningroutes.com/*`. That route needs one proxied record, `AAAA * 100::`; a name with its own DNS-only record, such as mail's, doesn't pass through it.

8. **Sign in once with your own email.** Sign-in links go out through Cloudflare Email Sending, which needs Workers Paid and is in beta. No link ever goes to a log outside local development.
   1. Enable sending for the domain, and add the DNS records it asks for:

      ```sh
      pnpm --filter @learning-routes/api exec wrangler email sending enable learningroutes.com
      ```

   2. Ask for a link at `https://app.learningroutes.com/sign-in`.
   3. Open the link in the email, within five minutes, and choose "Sign in".

9. **Run the seed** with that email, as the default role:

   ```sh
   DATABASE_URL_MIGRATOR="$(security find-generic-password -s lr-migrator -w)" pnpm --filter @learning-routes/api db:seed --owner you@example.com
   ```

   It creates English Unlimited, makes you its owner and publishes one sample route. It refuses an address that hasn't signed in (step 8). Running it again changes nothing. To add a second owner later, add `--add-owner`.

10. **If a branch is ever restored from a backup:** PlanetScale's docs say passwords are reset, and the old credentials don't work on the restored branch. Roles made in PlanetScale come back with the branch; the docs don't say whether a role made with SQL does. In this order:
    1. Copy the default role's new URL from PlanetScale, and replace the Keychain item. The old one no longer works.

       ```sh
       security delete-generic-password -s lr-migrator
       security add-generic-password -a "$USER" -s lr-migrator -w
       ```

    2. Check whether `lr_app` came back:

       ```sh
       psql "$(security find-generic-password -s lr-migrator -w)" -c "select count(*) from pg_roles where rolname = 'lr_app'"
       ```

       If it answers `0`, do step 2 again. Then give the role its exact grants back, and check the one it must never have. The last command must print `f`:

       ```sh
       psql "$(security find-generic-password -s lr-migrator -w)" -v ON_ERROR_STOP=1 -f apps/api/drizzle/0013_app_grants.sql -f apps/api/drizzle/0016_catalog_grants.sql -f apps/api/drizzle/0023_start_grants.sql -f apps/api/drizzle/0025_create_space_grants.sql -f apps/api/drizzle/0027_oauth_grants.sql
       psql "$(security find-generic-password -s lr-migrator -w)" -tAc "select has_table_privilege('lr_app', '\"user\"', 'delete')"
       ```

    3. Set `lr_app`'s new password with `\password lr_app` in `psql`, and replace its Keychain item the same way.
    4. Point Hyperdrive at the new URL:

       ```sh
       pnpm --filter @learning-routes/api exec wrangler hyperdrive update <id> --connection-string="$(security find-generic-password -s lr-app -w)"
       ```

## Also to set up


## Later

- **A nightly `pg_dump` to R2**, kept for 30 days, as a copy outside PlanetScale. Not built yet; a future STEP.

## The storefront's reads (Platform STEP 4 §1)

Do these once, before running the migrations that come with Platform STEP 4: migration `0014` grants to a role that must already exist.

1. **Create the storefront's role, `lr_public`,** the same way as `lr_app`. It reads the public views and nothing else:

   ```sh
   psql "$(security find-generic-password -s lr-migrator -w)" -c "create role lr_public login noinherit"
   psql "$(security find-generic-password -s lr-migrator -w)" -c "grant connect on database postgres to lr_public; grant usage on schema public to lr_public"
   psql "$(security find-generic-password -s lr-migrator -w)"
   ```

   In that session, type `\password lr_public`, then `\q`. Save its URL, on port 5432, with the branch id in the user name:

   ```sh
   security add-generic-password -U -a "$USER" -s lr-public -w
   ```

2. **Run the migrations,** as in step 3 above.

3. **Create the second Hyperdrive config,** with caching on, which is the default: 60 s, and 15 s stale.

   ```sh
   pnpm --filter @learning-routes/web exec wrangler hyperdrive create lr-db-public \
     --connection-string="$(security find-generic-password -s lr-public -w)" \
     --sslmode verify-full --origin-connection-limit 20
   ```

   Put the printed id in `apps/web/wrangler.jsonc`, under `hyperdrive`, in a small pull request.

4. **Create the purge queue and the token.** The queue:

   ```sh
   pnpm --filter @learning-routes/api exec wrangler queues create learning-routes-purge
   ```

   In Cloudflare, under My Profile, API Tokens, create a token with one permission, **Zone: Cache Purge**, on the one zone. Copy it, set it at wrangler's prompt, then clear the clipboard:

   ```sh
   pnpm --filter @learning-routes/api exec wrangler secret put CLOUDFLARE_PURGE_TOKEN
   pbcopy < /dev/null
   ```

**After a restore,** `lr_public` needs its grants back. Step 10 re-runs lr_app's files; also run `grant usage on schema public to lr_public` and the `grant select` lines at the end of `0014`, `0019` and `0021`.

## Turnstile on "Quiero enseñar" (Platform STEP 4 §6.3)

The widget is managed, for `app.learningroutes.com` only, and its site key is in `apps/web/wrangler.jsonc`. It needs its secret on the API Worker. Copy it from the widget's page in Cloudflare, set it at wrangler's prompt, then clear the clipboard:

```sh
pnpm --filter @learning-routes/api exec wrangler secret put TURNSTILE_SECRET
pbcopy < /dev/null
```

Cloudflare's test keys pass only where `ENVIRONMENT` is `development`, so a missing secret refuses every application rather than letting them all through.
