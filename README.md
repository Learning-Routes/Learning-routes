# Learning Routes

AI-powered personalized learning platform. Tell us what you want to master and get a unique learning route with assessments that adapt to your real progress.

## Tech Stack

- **Ruby 3.3.8** / **Rails 8.1.2**
- **PostgreSQL 17** (local dev) / **Neon** (cloud database)
- **Tailwind CSS v4** + **Hotwire** (Turbo + Stimulus)
- **Solid Queue** / **Solid Cache** / **Solid Cable**
- **Propshaft** (asset pipeline) + **Importmap**
- **Kamal 2** deployment to **Hetzner** (Docker)
- **Cloudflare** for DNS, SSL, CDN, and DDoS protection
- **Docker Hub** as container registry

## Architecture

Modular monolith with 6 Rails engines:

| Engine | Purpose |
|---|---|
| `core` | Users, sessions, authentication, onboarding |
| `learning_routes_engine` | Learning profiles, routes, steps, FSRS scheduling |
| `content_engine` | AI-generated content, caching, user notes |
| `assessments` | Exams, questions, grading, gap analysis |
| `ai_orchestrator` | Multi-model routing, prompt building, cost tracking |
| `analytics` | Progress snapshots, study sessions, metrics |

## Infrastructure

```
Users → Cloudflare (DNS/CDN/SSL) → Hetzner (Docker + Kamal) → Neon (Cloud PostgreSQL)
```

| Service | Role | Tier |
|---|---|---|
| Cloudflare | DNS, SSL, CDN, proxy | Free |
| Hetzner | Rails app server (Docker + Kamal 2) | ~$5/mo |
| Neon | Cloud PostgreSQL 17 database | Free |
| Docker Hub | Container registry | Free |

## Design System

- **Theme**: Warm cream light (#F5F1EB bg, #1C1812 text, #2C261E accent)
- **Fonts**: DM Sans (body) + DM Mono (labels/code)
- **Landing page**: 7 sections (hero, how it works, path, outcomes, features, integrations, CTA)
- **Auth pages**: Custom styled registration, login, password reset

## Getting Started

```bash
# Install dependencies
bundle install

# Setup database
bin/rails db:create db:migrate db:seed

# Start development server (includes Tailwind watcher)
bin/dev
```

> Requires Ruby 3.3.8 (via rbenv), PostgreSQL 17, and API keys for AI providers.

## Development

```bash
# Run tests
bin/rails test

# Run tests for a specific engine
bin/rails test engines/core/test/

# Rails console
bin/rails console
```

## Deployment

Deployed via Kamal 2 to Hetzner with Docker Hub as the container registry. DNS and SSL managed through Cloudflare.

```bash
kamal setup    # First deploy
kamal deploy   # Subsequent deploys
```

## Domain

**learning-routes.com**

## License

All rights reserved.
