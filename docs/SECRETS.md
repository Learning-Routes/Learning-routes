# Secrets & Credentials

## How secrets are delivered today

- **Runtime:** all third-party secrets reach the app as **environment
  variables**, injected by Kamal from `.kamal/secrets` (which reads the values
  from a `.env` file on the *deploy* machine at deploy time).
- `config/credentials.yml.enc` currently holds only `secret_key_base`.
- `.env` is **empty in the repo**, and is excluded from git (`.gitignore:
  /.env*`) and from the Docker image (`.dockerignore: .env*`), so no plaintext
  secret is ever committed or shipped in the container.
- `Rack::Attack` blocks web requests probing for `/.env`, `/.git`, etc.

## Application lookup order

Every secret is read **credentials-first, with ENV as a transitional
fallback**:

```ruby
Rails.application.credentials.dig(:openai, :api_key).presence || ENV["OPENAI_API_KEY"]
```

So the moment you populate encrypted credentials, they become the source of
truth; until then, the existing ENV delivery keeps working unchanged. Nothing
breaks during the transition.

## Migrating a secret into encrypted credentials

Requires the master key (`config/master.key`, or `RAILS_MASTER_KEY` in the
environment). It is **not** in the repo — keep it that way.

```bash
# Edit the (shared) encrypted credentials:
EDITOR="code --wait" bin/rails credentials:edit
```

Populate this structure (keys match what the code reads):

```yaml
secret_key_base: <keep the existing value>

openai:
  api_key: sk-...

elevenlabs:
  api_key: ...

resend:
  api_key: re_...

tavily:
  api_key: tvly-...

google:
  client_id: ...apps.googleusercontent.com
  client_secret: ...
```

Not stored in credentials (infra, delivered via Kamal→ENV; `database.yml` is
read too early to rely on credentials):

- `POSTGRES_PASSWORD` / `DB_PASSWORD`
- `KAMAL_REGISTRY_PASSWORD` (see `.kamal/secrets`)
- `RAILS_MASTER_KEY`

## Verifying

```bash
bin/rails runner 'puts Rails.application.credentials.dig(:openai, :api_key).present?'
```

## Rotating

If any key was ever committed or exposed: rotate it at the provider, update
credentials (or the deploy `.env`), and redeploy with `kamal deploy`. Ensure
`config/master.key` / `RAILS_MASTER_KEY` is present on the server.
