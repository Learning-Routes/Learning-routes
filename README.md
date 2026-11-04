# Learning Routes

Learning Routes is a platform where creators build learning routes by talking to agents, then publish them on their own page and sell them to their own students. This folder is the new platform. The v1 Rails app around it, at the root of the Learning-routes repository, keeps serving learningroutes.com while the platform is built.

## Layout

| Path                 | What it is                                                       |
| -------------------- | ---------------------------------------------------------------- |
| `apps/web`           | Every page, on React Router 8 running on Cloudflare Workers      |
| `apps/api`           | The API on Hono and Workers (`GET /health` today)                |
| `packages/core`      | The domain: schemas and business rules, with no platform imports |
| `packages/design-tokens` | The Ciruela design tokens and the Archivo and DM Mono fonts |
| `packages/route-map` | The route map's geometry                                     |
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

CI runs all of it in `.github/workflows/platform.yml`. Local secrets go in `apps/*/.dev.vars`, which git ignores.

`packages/core` is checked against fixtures captured from v1, the Rails app this platform replaced. v1's code is at the tag `v1-final`.

## Docs

- [Foundations](docs/FOUNDATIONS.md): read this first
- [ADR 0001: the stack](docs/adr/0001-stack.md)
- [ADR 0002: what goes in core](docs/adr/0002-core-boundary.md)
- [ADR 0003: decisions from the v1 port](docs/adr/0003-v1-port-decisions.md)
- [ADR 0004: the architecture after the bake-off](docs/adr/0004-architecture-after-the-bake-off.md)
- [Lessons from v1](docs/LESSONS_FROM_V1.md)
- [Working agreement](docs/WORKING_AGREEMENT.md)
