# Hosts

| Host | Serves | State |
|---|---|---|
| `learningroutes.com` | v1, the Rails app at the repository root | live |
| `new.learningroutes.com` | the landing and the catalog, as **New Learning Routes** | planned; not deployed yet |
| `app.learningroutes.com` | sign-in, "Empezar", "Quiero enseñar", Mis rutas, admin, and `/api` | planned; not deployed yet |
| `[slug].learningroutes.com` | each creator's page and routes | planned; not deployed yet |

The name and the planned host are constants in `platform/packages/core/src/locales.ts` (`BRAND`, `PLANNED_HOST`). At the switch (FOUNDATIONS.md §2, stage 3), `learningroutes.com` points at the platform and the name drops "New"; both change there, in one line each. Packages (`@learning-routes/*`) and Workers (`learning-routes-*`) already have their final names.

One Worker serves all three, and `apps/web/workers/hosts.ts` picks by host. `PLATFORM_ORIGIN`, `APP_ORIGIN` and `CREATOR_DOMAIN` in `apps/web/wrangler.jsonc` say which is which. Slugs that name a host the platform keeps are nobody's: the list is `RESERVED_SLUGS` in `packages/core/src/reserved-slugs.ts`, and a check in the database holds it too. A new subdomain goes on that list, with a migration that updates the check. Cloudflare's Universal SSL covers one level under the apex, so `[slug].learningroutes.com` needs no extra certificate, where `[slug].new.learningroutes.com` would.
