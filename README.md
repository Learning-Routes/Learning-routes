# Learning Routes

AI-powered personalized learning platform. Tell us what you want to master and get a unique learning route with assessments that adapt to your real progress.

## Tech Stack

- **Ruby 3.3.8** / **Rails 8.1.2**
- **PostgreSQL 16**
- **Tailwind CSS v4** + **Hotwire** (Turbo + Stimulus)
- **Solid Queue** / **Solid Cache** / **Solid Cable**
- **Kamal 2** deployment to Hetzner

## Architecture

Modular monolith with 6 Rails engines:

| Engine | Purpose |
|---|---|
| `core` | Users, sessions, authentication, onboarding |
| `learning_routes_engine` | Learning profiles, routes, steps, FSRS scheduling |
| `content_engine` | AI-generated content, caching |
| `assessments` | Exams, questions, grading, gap analysis |
| `ai_orchestrator` | Multi-model routing, prompt building, cost tracking |
| `analytics` | Progress snapshots, study sessions, metrics |

## Getting Started

```bash
# Install dependencies
bundle install

# Setup database
bin/rails db:create db:migrate db:seed

# Start development server (includes Tailwind watcher)
bin/dev
```

> Requires Ruby 3.3.8 (via rbenv), PostgreSQL 16, and API keys for AI providers.

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

Deployed via Kamal 2 to Hetzner with Docker Hub as the container registry.

```bash
kamal setup    # First deploy
kamal deploy   # Subsequent deploys
```

## Domain

**learning-routes.com**

## License

All rights reserved.
