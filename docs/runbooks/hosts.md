# Hosts

| Host | Serves |
|---|---|
| `learningroutes.com` | the landing and the catalog |
| `app.learningroutes.com` | sign-in, "Empezar", "Quiero enseñar", Mis rutas, admin, `/api` and `/mcp` |
| `[slug].learningroutes.com` | each creator's page and routes |

The name and the host are constants in `packages/core/src/locales.ts` (`BRAND`, `PLANNED_HOST`).

One Worker serves all three, and `apps/web/workers/hosts.ts` picks by host. `PLATFORM_ORIGIN`, `APP_ORIGIN` and `CREATOR_DOMAIN` in `apps/web/wrangler.jsonc` say which is which. Slugs that name a host the platform keeps are nobody's: the list is `RESERVED_SLUGS` in `packages/core/src/reserved-slugs.ts`, and a check in the database holds it too. A new subdomain goes on that list, with a migration that updates the check. Cloudflare's Universal SSL covers one level under the apex, so `[slug].learningroutes.com` needs no extra certificate, where `[slug].learningroutes.com` would.
