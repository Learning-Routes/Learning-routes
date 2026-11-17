# Hosts

| Host | Serves |
|---|---|
| `learningroutes.com` | the landing and the catalog, and since Platform STEP 19 the app: sign-in, "Empezar", "Quiero enseñar", Mis rutas, admin, `/api` and `/mcp` |
| `app.learningroutes.com` | nothing of its own: every request answers 308 to the same path on `learningroutes.com`, after one silent hand-off for someone signed in (`docs/runbooks/one-address.md`) |
| `[slug].learningroutes.com` | each creator's page and routes |

The name and the host are constants in `packages/core/src/locales.ts` (`BRAND`, `PLANNED_HOST`).

One Worker serves all of them, and `apps/web/workers/hosts.ts` picks by host. `PLATFORM_ORIGIN`, `APP_ORIGIN` (the same host since STEP 19), `OLD_APP_ORIGIN` and `CREATOR_DOMAIN` in `apps/web/wrangler.jsonc` say which is which. Slugs that name a host the platform keeps are nobody's: the list is `RESERVED_SLUGS` in `packages/core/src/reserved-slugs.ts`, and a check in the database holds it too. A new subdomain goes on that list, with a migration that updates the check. Cloudflare's Universal SSL covers one level under the apex, so `[slug].learningroutes.com` needs no extra certificate, where `[slug].learningroutes.com` would.
