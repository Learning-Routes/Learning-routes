# Hosts

| Host | Serves | State |
|---|---|---|
| `learningroutes.com` | v1, the Rails app at the repository root | live |
| `new.learningroutes.com` | the platform, as **New Learning Routes** | planned; not deployed yet |

The name and the planned host are constants in `platform/packages/core/src/locales.ts` (`BRAND`, `PLANNED_HOST`). At the switch (FOUNDATIONS.md §2, stage 3), `learningroutes.com` points at the platform and the name drops "New"; both change there, in one line each. Packages (`@learning-routes/*`) and Workers (`learning-routes-*`) already have their final names.
