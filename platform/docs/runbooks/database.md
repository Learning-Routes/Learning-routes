# Runbook: the platform's database

The owner's steps to put the platform's database into service after Platform STEP 2 is merged. Each numbered step is one action, done once, in order.

**Secrets never touch a command line or the shell history.** Each is kept in the macOS Keychain and read with `$(security find-generic-password -s <name> -w)`, so the history holds the command, never the value. To save one, put `-w` last with no value, so the Keychain prompts for it:

```sh
security add-generic-password -a "$USER" -s lr-migrator -w
```

The Keychain items this runbook uses:

| Item | Holds |
|---|---|
| `lr-migrator` | The migrator's connection URL: PlanetScale's default role, which runs migrations and the seed |
| `lr-app` | The Worker's connection URL: the `lr_app` role, which Hyperdrive connects as |

## Before you start

- Platform STEP 2 is merged, and `main` is green.
- You can sign in to PlanetScale and to Cloudflare (`npx wrangler login`).
- In `platform/`, `pnpm install` has run.

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

   In the last `psql` session, type `\password lr_app`. It prompts for the password twice and never echoes it. Then `\q`. Save `lr_app`'s URL in the Keychain. Its user name carries the branch id, as PlanetScale requires (`lr_app.<branch-id>`).

   ```sh
   security add-generic-password -a "$USER" -s lr-app -w
   ```

   Check that the role connects and can do nothing yet:

   ```sh
   psql "$(security find-generic-password -s lr-app -w)" -c "select current_user, has_schema_privilege('public', 'create')"
   ```

   It should answer `lr_app | f`. The grants table by table come with the migrations in step 3. Never grant `lr_app` `pg_read_all_data` or `pg_write_all_data`: a later revoke on one table can't take those back.

   **Not done in production:** the local role script's `grant lr_app to lr_migrator`. It's there only so the tests can act as `lr_app`.

3. **Run the migrations** as the default role, over the direct connection:

   ```sh
   DATABASE_URL_MIGRATOR="$(security find-generic-password -s lr-migrator -w)" pnpm --filter @learning-routes/api db:migrate
   ```

   It prints the migrations it applied. Run it again: it should apply nothing.

   **This is also the first check that PlanetScale accepts the security-definer functions and the row-level security** (`app.member_space_ids`, `app.enroll`, the policies). The docs claim the full Postgres feature set but don't mention these. If a migration fails here, stop and send the error. The fallback is described in the pull request for §3.

4. **Create the Hyperdrive config,** with caching off, so a session or a permission is never served from a cache:

   ```sh
   npx wrangler hyperdrive create lr-db \
     --connection-string="$(security find-generic-password -s lr-app -w)" \
     --caching-disabled --sslmode verify-full --origin-connection-limit 20
   ```

   - **The connection limit** is Hyperdrive's soft cap on connections to the database. Its minimum is 5, and its maximum is about 100 on a paid plan. Keep it below the share of PlanetScale's `max_connections` you want the Worker to use, which depends on the cluster's size.
   - **If `verify-full` fails** with a certificate error: Cloudflare's docs pair it with a CA you upload (`npx wrangler cert upload certificate-authority`), passed with `--ca-certificate-id`. Neither side documents which CA PlanetScale's certificate chains to. If you have to upload one, record which in this runbook.
   - **Also unconfirmed:** neither side's docs say whether a role made with SQL can connect through Hyperdrive. Step 7 checks it.

5. **Put the config's id in `apps/api/wrangler.jsonc`.** Replace the placeholder `id` under `hyperdrive` with the one step 4 printed, in a small pull request. The id isn't a secret.

6. **Set the auth secret,** piped straight from `openssl` to Cloudflare, so it's never printed or saved:

   ```sh
   openssl rand -base64 32 | npx wrangler secret put BETTER_AUTH_SECRET --cwd apps/api
   ```

   The app origin isn't a secret: it's `APP_ORIGIN` in `apps/api/wrangler.jsonc` (`https://new.learningroutes.com`). Change it there if the app moves.

7. **Deploy, and check.** Merge the pull request from step 5 and let it deploy. Then:

   ```sh
   curl -s https://new.learningroutes.com/health
   curl -s https://new.learningroutes.com/api/auth/ok
   ```

   - **The first** answers `{"ok":true,...}`.
   - **The second** answers `{"ok":true}` only if the Worker reached the database through Hyperdrive as `lr_app`. That proves the SQL-created role connects (step 4).

8. **Sign in once with your own email.** Email delivery is a later STEP, so production sends no sign-in links (`EMAIL_DELIVERY` is `"none"`). For this one sign-in, switch on the development sender, which writes the link to the Worker's log, then switch it off again:
   1. In `apps/api/wrangler.jsonc`, set `"EMAIL_DELIVERY": "log"` and deploy.
   2. In one terminal, run `npx wrangler tail learning-routes-api --format pretty`.
   3. Ask for a link at `https://new.learningroutes.com/api/auth/sign-in/magic-link`: a POST with your email, from the app's own page once it exists, or from the browser console on the app origin.
   4. Open the link the tail shows, within five minutes, and choose "Sign in".
   5. Set `"EMAIL_DELIVERY"` back to `"none"` and deploy at once.

   The link signs in once and expires in five minutes, but it stays in Workers Logs until their retention ends. Do this only for your own address.

9. **Run the seed** with that email, as the default role:

   ```sh
   DATABASE_URL_MIGRATOR="$(security find-generic-password -s lr-migrator -w)" pnpm --filter @learning-routes/api db:seed --owner you@example.com
   ```

   It creates English Unlimited, makes you its owner and publishes one sample route. It refuses an address that hasn't signed in (step 8). Running it again changes nothing. To add a second owner later, add `--add-owner`.

10. **If a branch is ever restored from a backup:** PlanetScale's docs say passwords are reset, and the old credentials don't work on the restored branch. Roles made in PlanetScale come back with the branch. The docs don't say whether a role made with SQL does, so check that `lr_app` exists first.
    1. Set new passwords. In `psql` on the default role's new URL, run `\password lr_app`.
    2. Save both new URLs in the Keychain. Delete the old items first, with `security delete-generic-password -s lr-app` and the same for `lr-migrator`.
    3. Point Hyperdrive at the new URL:

       ```sh
       npx wrangler hyperdrive update <id> --connection-string="$(security find-generic-password -s lr-app -w)"
       ```

## Also to set up

- **A rate limit on the sign-in page.** `GET /api/auth/magic-link/confirm` reads the database once per request and has no limit of its own; Better Auth limits the rest. Add a Cloudflare rate-limiting rule on that path, for example 30 requests a minute per IP.

## Later

- **A nightly `pg_dump` to R2**, kept for 30 days, as a copy outside PlanetScale. Not built yet; a future STEP.
