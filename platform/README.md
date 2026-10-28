# Learning Routes platform

Learning Routes is a platform where creators build learning routes by talking to agents, then publish them on their own page and sell them to their own students. This repository is the new platform; the v1 Rails app keeps serving learningroutes.com while it is built.

## Layout

| Path                 | What it is                                                       |
| -------------------- | ---------------------------------------------------------------- |
| `apps/web`           | Every page, on React Router 8 running on Cloudflare Workers      |
| `apps/api`           | The API on Hono and Workers (`GET /health` today)                |
| `packages/core`      | The domain: schemas and business rules, with no platform imports |
| `packages/ui-tokens` | The Ciruela design tokens and the Archivo and DM Mono fonts      |
| `packages/journey`   | The route map modules                                            |
| `docs/`              | Decisions, lessons from v1 and how we work                       |

## Install and run

You need Node 22 (`.nvmrc`) and pnpm 10 (`corepack enable` gives you the version in `package.json`).

```sh
pnpm install
pnpm dev        # web on http://localhost:5173, api on http://localhost:8787
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Nothing is deployed yet. Local secrets, once there are any, go in `apps/*/.dev.vars`, which git ignores.

`packages/core` is checked against fixtures captured from the v1 Rails app. With Learning-routes cloned next to this repository and its database migrated, `pnpm golden:check` confirms v1 still produces them (see `packages/core/test/golden/README.md`).

## Docs

- [ADR 0001: the stack](docs/adr/0001-stack.md)
- [ADR 0002: what goes in core](docs/adr/0002-core-boundary.md)
- [Lessons from v1](docs/LESSONS_FROM_V1.md)
- [Working agreement](docs/WORKING_AGREEMENT.md)
