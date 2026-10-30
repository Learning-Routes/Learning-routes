# Rotate the production Postgres password

**Who:** the owner, on his Mac, in one terminal window from the project root. About five
minutes. Nothing in this runbook prints the password.

## How the password travels

`.env.deploy` (`export POSTGRES_PASSWORD=…`) → `.kamal/secrets` (`POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`)
→ the env file Kamal uploads to the server on every `app boot` / `deploy` → `config/database.yml:59`
in the `web` and `job` containers.

The `postgres` accessory also receives `POSTGRES_PASSWORD`, but the image reads it only when it
initialises an empty data volume. The live password is whatever the last `ALTER USER` set.
That is why changing `.env.deploy` alone does nothing, and why the accessory does not need a
reboot.

## Order (so nobody is locked out)

New value saved in `.env.deploy` first → `ALTER USER` → `kamal app boot` → verify → remove the
backup. If the terminal closes halfway, the new value is already in the file.

Between steps 6 and 7 (about a minute), a brand-new database connection from the running app
would fail; connections already open keep working. Do it when nobody is using the site.

## Steps

1. `cd ~/Documents/Learning-routes`
2. Check the server and the container name — it must print `learning_routes-postgres`:
   ```
   ssh -i ~/.ssh/learningroutes_ed25519 root@178.156.240.166 'docker ps --format "{{.Names}}"' | grep postgres
   ```
3. Temporary backup: `cp .env.deploy .env.deploy.bak-pg`
4. New password, never shown: `NEW_PG=$(openssl rand -hex 24)` — then `echo ${#NEW_PG}` must
   print `48` (only the length).
5. Save it in `.env.deploy`:
   ```
   sed -i '' "s/^export POSTGRES_PASSWORD=.*/export POSTGRES_PASSWORD=$NEW_PG/" .env.deploy
   grep -c "^export POSTGRES_PASSWORD=$NEW_PG\$" .env.deploy
   ```
   The second command must print `1`.
6. Change it in the database (sent through stdin, so it is not in any command line or log) —
   it must print `ALTER ROLE`:
   ```
   printf "ALTER USER learning_routes WITH PASSWORD '%s';\n" "$NEW_PG" | ssh -i ~/.ssh/learningroutes_ed25519 root@178.156.240.166 'docker exec -i learning_routes-postgres psql -U learning_routes -d learning_routes_production -v ON_ERROR_STOP=1'
   ```
7. Restart the app with it (no build; Kamal uploads the new env file and swaps containers):
   ```
   source .env.deploy && bin/kamal app boot
   ```
8. Verify:
   ```
   curl -s -o /dev/null -w "%{http_code}\n" https://learningroutes.com/up
   bin/kamal app exec -r job 'bin/rails db:migrate:status' | tail -3
   ```
   The first prints `200`; the second lists migrations as `up` (it can only do that if the new
   password works). Then open the dashboard in the browser.
9. Clean up: `rm .env.deploy.bak-pg && unset NEW_PG`

## If something goes wrong

- Step 2 prints nothing: stop; nothing has changed.
- Step 6 does not print `ALTER ROLE`: the database still has the old password. Put the file
  back with `cp .env.deploy.bak-pg .env.deploy` and stop.
- Step 7 or 8 fails after step 6 printed `ALTER ROLE`: the file and the database agree on the
  new value. Keep the terminal open (it holds `NEW_PG`) and ask the reviewer before doing
  anything else.

## Notes

- No GitHub workflow deploys the Rails app and GitHub holds no deploy secret; the deploy runs
  from the owner's machine (`platform/docs/runbooks/github.md`, "Deploying the Rails app").
- `.env.deploy*` is ignored by git (`/.env*`). Never commit it.
