# Platform STEP 7: Make it real

Written by the reviewer, 4 November 2026. Start once STEP 5 is merged. STEP 6 (design) keeps running in its own session; rebase onto it as it lands.

## 0. Context

The owner's local MCP test stalled on setup, not on code:
- a URL pasted wrong;
- a teacher role that had to be seeded by hand;
- ChatGPT and Claude on the web can't reach `localhost`.

His earlier prototype MCP connected to everything from a public URL, and that is the bar. **Ship the platform to the internet now, and make connecting an assistant as simple as it can be.**

**The goal.** A creator does exactly this, from any assistant:
1. Paste one address: `https://app.learningroutes.com/mcp`.
2. Sign in with their email, or skip this if already signed in.
3. Press "Permitir".

From then on they can say "importa esta ruta" and "publícala".

**The owner does as little as possible.** You run every command: wrangler, the PlanetScale CLI, migrations, secrets, DNS through the API. Ask him only for what needs his hands:
- a browser login, or approving a charge;
- the final test.

Give each of his steps numbered, one action each. Before any charge, say what it costs per month and wait for his yes.

**Hosts until the switch (ADR 0004 and STEP 4):**

| Host | Serves |
| --- | --- |
| learningroutes.com | The landing and the catalog |
| app.learningroutes.com | The app, sign-in, admin and `/mcp` |
| [slug].learningroutes.com | Each creator's page |

## §0. v1 retires first (the owner's change of plan, 4 November 2026)

v1 is retired, so the platform takes learningroutes.com directly. Rails isn't updated, and v1 isn't deployed again. Where a section below assumes v1 stays or `new.learningroutes.com` exists, this section wins.

1. **An encrypted backup of v1, verified by a restore.** It never goes in the repository, a log or a PR.
2. **A holding page on learningroutes.com,** until the platform takes the host.
3. **Stop v1's containers.** Deleting the server is the owner's step.
4. **One PR:** remove Ruby, move `platform/` to the repository's root, and drop "New" from the brand.

**Ask the owner only for** browser logins, the server's deletion and any charge. Before any DNS change, show him the records before and after.

## Batch rules

- **Same as always:**
  - no tool or AI attribution anywhere;
  - the repo is public, so no secret, personal detail, hostname of a private resource or security finding goes in a commit, PR, issue or log;
  - exact pins;
  - one PR per section;
  - `pnpm check` before every push;
  - explicit paths in `git add`, never `-A` or `.`.
- **Secrets live only in Wrangler secrets and the owner's Keychain.**
  - Never print one, echo one, write one to a file in the repo, or paste one into a PR.
  - Generate random secrets with `openssl rand` piped straight into `wrangler secret put`.
- **Skills:**
  - wrangler and workers-best-practices;
  - cloudflare (DNS, Hyperdrive, Email Service, Turnstile);
  - cloudflare-email-service;
  - turnstile-spin;
  - lr-data-and-tenancy;
  - lr-performance-budget;
  - agent-protocols:shipping-and-launch;
  - a security skill.
- **Verify every product fact against current docs before you rely on it:** prices, plan limits, CLI flags, DNS behaviour. Quote what you found in the PR.

## §1. Production database: PlanetScale Postgres

1. **Find the smallest PlanetScale Postgres option that fits:**
   - the region nearest the owner's users;
   - Postgres 18;
   - the `pg_trgm` extension;
   - the price.

   Tell the owner the monthly cost and wait for his yes. Then he logs in to the CLI in the browser; you create everything else.
2. **Create:**
   - the database;
   - the roles `lr_migrator`, `lr_app` and `lr_public` with strong random passwords that go straight into secrets;
   - the grants file, run idempotently.

   Run every migration as `lr_migrator`, then run the grants check from `grants.test.ts` against production: read-only queries, no data.
3. **Two Hyperdrive configs:**
   - `DB`: caching off, as `lr_app`;
   - `DB_PUBLIC`: caching on, as `lr_public`.
4. **Backups and branches.**
   - Confirm PlanetScale's backup schedule and point-in-time recovery for this plan, and write them in `docs/runbooks/database.md`.
   - Never run tests against production.
   - Seed data never goes to production.

## §2. The Workers, the hosts and the certificates

1. **Deploy the three Workers** (web, api, mcp) with production `wrangler` environments. Then:
   - **Bindings:** service bindings, the Hyperdrive bindings, and the purge queue.
   - **Observability:** traces and logs, with no personal data in logs.
2. **Hosts:**
   - `learningroutes.com` and `app.learningroutes.com` as Workers custom domains.
   - **Creator hosts:** do not add a wildcard route over `*.learningroutes.com`. It would capture every v1 subdomain. Two options:
     - **Option A:** add each creator's host as its own Workers custom domain when their space is created, through the Cloudflare API from a queued job.
     - **Option B:** a wildcard limited to a subdomain we own, such as `*.rutas.learningroutes.com`. Check whether that needs Advanced Certificate Manager, and at what price.

     **Recommend one with numbers in the PR. Default: option A.**
   - List every DNS record that exists today before you add one, and add records only. Never change or delete an existing record.
3. **Security headers.** These are checked on the live hosts by a smoke test:
   - CSP;
   - HSTS (start with `max-age` of one day, without `preload`);
   - `X-Content-Type-Options`;
   - `Referrer-Policy`;
   - `Permissions-Policy`.

## §3. Email that arrives

1. **Cloudflare Email Service:**
   - onboard the sending domain, with SPF, DKIM and DMARC records added, not replacing any;
   - verify deliverability to Gmail and Outlook;
   - the sign-in email is the v2 `Correo` design, plain-text part included.

   If Email Service is still beta-gated for the account, say so and stop to ask; never switch providers silently.
2. **The magic link works on the phone that opens it.** The STEP 4 start intent stays on the browser that asked. Fix the cross-device case: bind the pending route to the sign-in token on the server, so opening the email on another device still lands on "Empezar".

## §4. The simplest possible connection

1. **The server URL is `https://app.learningroutes.com/mcp`.** It is the only thing a creator types or pastes.
2. **Sign-in inside the OAuth flow:**
   - **Signed in already:** straight to consent.
   - **Not signed in:** the sign-in page explains, in one line, that they are connecting an assistant. After the link, it returns straight to consent, on any device.
   - **The session lasts 30 days on that browser.**
3. **Consent.** Keep it one screen. Show:
   - the client's name and icon;
   - what it may do, in plain words;
   - "Permitir" and "No permitir".
4. **No dead ends.** An account without a teaching role sees why it can't connect, and two ways forward:
   - "Quiero enseñar";
   - "Volver a Mis rutas".
5. **"Conecta tu asistente" page, with one tab per client:**
   - **Claude (web and desktop):** add a custom connector.
   - **Claude Code:** the one-line `claude mcp add --transport http --scope user learning-routes https://app.learningroutes.com/mcp`, with a copy button.
   - **ChatGPT:** developer mode and connectors.
   - **Gemini**, if it supports remote MCP today.

   Each tab has at most three steps and the URL with a copy button. Verify each client's current steps and its plan requirements, and write them in. If a client supports a one-click "add" link, use it.
6. **Refresh tokens.** Verify which clients ask for `offline_access`. A creator must not have to sign in again every hour.

## §5. The owner's own space, in production

1. **A one-off, idempotent script `pnpm ops:bootstrap-owner`.** Run it once against production with the owner's email read from the Keychain or a prompt, never from a file. It:
   - makes that account the platform operator;
   - creates the owner's own space, named by him.

   It also runs on an account that doesn't exist yet: the grant applies on first sign-in.
2. **Nothing else is seeded.** No invented creators or routes in production.

## §6. Turnstile, for real

1. Create the production Turnstile widget for `app.learningroutes.com`, managed mode. Put its secret in Wrangler secrets and its site key in config.
2. The "Quiero enseñar" form works on the live site, with a test submission the owner deletes from admin afterwards.

## §7. Prove it live

1. **A smoke test, `pnpm smoke:prod`, read-only.** It checks:
   - every host answers;
   - the headers are right;
   - `/mcp` answers 401 with the right metadata;
   - the protected-resource and authorization-server metadata are correct;
   - the storefront is cached on the second request.

   It runs after every deploy.
2. **The owner's test.** Give him these steps, each one action:
   1. Open `https://app.learningroutes.com`, sign in with his email, and get the link on his phone.
   2. In ChatGPT, add the connector with the URL, then sign in and press Permitir.
   3. Ask ChatGPT to import a small route into his space, then to publish it.
   4. Open the route's public page on his creator host.
   5. Repeat step 2 in Claude on the web and in Claude Code, and say "lista mis rutas".
   6. Disconnect each client in Conexiones and see the next call fail.
3. **Fix what his test finds before you close the STEP.**

## Report, in one message

- **PRs:** each one, with its run.
- **What exists in production:** the database, the Workers, the hosts and the DNS records added, by name only and with no secrets.
- **Monthly cost:** every paid item, with the source of each price.
- **Verifications:** what each "verify" found.
- **Smoke test:** its output.
- **The owner's steps:** numbered.
- **Open risks:** anything still unproven, and the runbook changes.
