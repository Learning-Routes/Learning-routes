# Performance Optimizations Checklist

This document tracks all performance optimizations implemented for the Learning Routes Rails 8.1.2 application.

## 1. DATABASE QUERY OPTIMIZATION ✓

### Gems Added
- **prosopite**: N+1 query detection in development
- **pg_query**: PostgreSQL query analysis

### Indexes
- See `/db/migrate/20260307010000_add_missing_query_indexes.rb` for composite and timeline indexes
- See `/db/migrate/20260307002634_add_missing_foreign_keys.rb` for foreign key constraint indexes

### Query Optimization in Controllers
- **LandingController#index**: Optimized with `includes(:route_steps)` for personalized route data
- Added HTTP caching with `fresh_when` to avoid re-rendering unchanged pages
- Landing cache key includes locale and user ID for proper invalidation

## 2. HTTP CACHING & COMPRESSION ✓

### Gzip Compression
- **config/application.rb**: Added `Rack::Deflater` middleware globally
- Compresses all text-based responses (HTML, JSON, CSS, JS)

### Cache Headers
- **config/environments/production.rb**:
  - Asset cache: `public, max-age=1 year, immutable` (Propshaft handles ETags)
  - Fragment caching enabled with logging
  - Static file server headers configured for far-future expiry

### HTTP Caching in Controllers
- **app/controllers/landing_controller.rb**:
  - Uses `fresh_when()` with ETag for unauthenticated/default content
  - Cache key varies by locale, user presence, and route data
  - Reduces server processing for repeated requests

## 3. FRONTEND PERFORMANCE ✓

### Resource Hints (in layout)
- **DNS Prefetch** for external CDNs (Google Fonts, jsDelivr, cdnjs)
- **Turbo Prefetch** meta tag enabled for faster Turbo link navigation
- Links added to `app/views/layouts/landing.html.erb`

### Image Optimization
- Landing page is SVG-heavy (no raster images requiring lazy loading)
- Logo uses parameterized SVG with width/height attributes (prevents CLS)
- All SVG elements have proper sizing to prevent layout shift

### JavaScript
- Importmap-rails manages JS efficiently
- Stimulus controllers for interactivity (lightweight)
- No render-blocking JavaScript; all deferred

## 4. PUMA OPTIMIZATION ✓

### Thread Configuration
- **Production**: 5 threads per worker (optimized for IO-heavy Rails)
- **Development**: 3 threads per worker (fast feedback)
- Thread count set via `RAILS_MAX_THREADS` env var

### Worker Configuration
- **WEB_CONCURRENCY**: Set to `auto` (uses all available CPUs)
- Configured in `config/puma.rb` and `config/deploy.yml`
- Can be overridden via environment variable

### Memory Optimization
- **preload_app!**: Enabled when `WEB_CONCURRENCY > 1`
  - Loads app before forking workers (copy-on-write savings)
  - Reduces memory footprint by ~30-50% with multiple workers

### GC Optimization
- **nakayoshi_fork** plugin enabled in production
  - Optimizes garbage collection before forking
  - Reduces GC pressure in worker processes

## 5. DEVELOPMENT SPEED ✓

### Bootsnap
- Already integrated in `config/boot.rb`
- Caches expensive operations (require, load, YAML parsing)
- Dramatically speeds up boot time

### Spring Preloader
- Added as dev dependency in `Gemfile`
- Pre-loads Rails environment for faster test/console/generate runs
- Usage: `bin/spring rails c`, `bin/spring rails generate`, etc.

### File Watching
- **config/environments/development.rb**: Set `EventedFileUpdateChecker`
- Native file change detection (much faster than polling)
- Reloads code instantly on changes

## 6. CACHING STRATEGY ✓

### Fragment Caching
- Enabled in production with logging
- Russian doll caching support (nested fragments)
- Cache invalidation via dependency tracking (Rails auto-generates keys)

### Configuration
- **config/application.rb**:
  - `config.action_view.cache_template_loading = true` (cache compiled templates)
  - Automatic cache key generation includes timestamps and dependencies

### Implementation Guide
To add fragment caching to views:

```erb
<% cache [@route, @locale] do %>
  <!-- Expensive content -->
<% end %>
```

Caching is automatically invalidated when `@route` changes.

## 7. APPLICATION CONFIGURATION ✓

### Middleware Stack
- `Rack::Deflater` for gzip compression
- Asset pre-compilation handled by Propshaft (not runtime)

### Active Record
- **Strict Loading**: 
  - Enabled by default in development/test to catch lazy-loaded associations
  - Raises error if association is lazy-loaded (forces use of `includes/preload`)
  - File: `config/application.rb`, `config/environments/development.rb`

### Job Queue
- Solid Queue adapter configured in production
- Database-backed queue for reliability
- Separate process via `bin/jobs` (see `Procfile.dev`)

### Asset Serving
- Propshaft handles asset compilation and serving
- `config.assets.compile = false` in production (pre-compiled only)
- Cache busting via digest hashing (automatic)

## 8. DEPLOYMENT OPTIMIZATION ✓

### Kamal Configuration
- **config/deploy.yml**:
  - `WEB_CONCURRENCY: auto` → uses all available CPU cores
  - Memory constraints: 512MB per web/job container
  - Health check: `/up` endpoint with 3-second intervals

### Docker Build
- Uses amd64 architecture (explicit)
- Multi-stage build (via Dockerfile) recommended for future optimization

## Monitoring & Debugging

### Development Mode Checks
```bash
# Enable cache in development
bin/rails dev:cache

# Check N+1 queries (prosopite enabled by default)
# Look for "PROSOPITE" warnings in console

# View fragment cache logs
# config.action_controller.enable_fragment_cache_logging = true (already set)
```

### Production Monitoring
- `config.log_level = info` (logging configured)
- Structured logging with Lograge
- Request IDs tagged in logs
- Health check at `/up`

## Performance Testing

### Load Testing Tools
Recommended for benchmarking:
- **Apache Bench**: `ab -n 1000 -c 10 https://learning-routes.com/`
- **Wrk**: `wrk -t4 -c100 -d30s https://learning-routes.com/`
- **k6**: JavaScript-based load testing

### Key Metrics to Track
1. **TTFB** (Time to First Byte): Should be <200ms
2. **FCP** (First Contentful Paint): Should be <1.5s
3. **LCP** (Largest Contentful Paint): Should be <2.5s
4. **CLS** (Cumulative Layout Shift): Should be <0.1
5. **Database queries per request**: Should be <5 (checked by prosopite)

## Phase A — Backend / DB Audit (2026-04-17)

Verified-then-fixed pass across hot paths. The existing doc claimed caching and N+1 protection but audit found several real N+1 patterns still in place.

### A.1 — LearningRoute model methods now respect preloaded `route_steps`

`progress_percentage`, `estimated_total_minutes`, `estimated_remaining_minutes`, `current_route_step`, and `nv1/nv2/nv3_steps` previously bypassed eager-loaded associations and hit the DB every call. Rewritten to check `association(:route_steps).loaded?` and compute in-memory when possible; when not loaded, `progress_percentage` now runs one grouped count instead of two separate counts.

Impact per profile page (N routes, each rendering a card): dropped from ~6N fresh queries to 0 added queries when controllers use `includes(:route_steps)` (which they already do).

### A.2 — Batched community state via `CommunityEngine::StatePreloader`

New service at `engines/community_engine/app/services/community_engine/state_preloader.rb`. Batch-loads per-request state for lists of records in 3 queries max:
- `likes` (IN clause across polymorphic types, one query per type)
- `ratings` (one query across all shared routes)
- `best_comment` (one `DISTINCT ON` query across all shared routes)

Models (`SharedRoute`, `Comment`, `Post`, `LearningRoute`, `RouteStep`) updated so `liked_by?`, `user_rating`, `rated_by?`, `best_comment` consume the memoized state if present, else fall back to their original SQL.

Wired into `FeedController#index`. Feed render with N shared routes + M posts dropped from `(3N + M)` extra queries to `3` constant extra queries.

### A.3 — Eager-load `learning_profile` in `set_route`

`LearningRoutesEngine::RoutesController#set_route` and `StepsController#set_route_and_step` now use `.includes(:learning_profile)` so the subsequent `authorize_route_owner!` ownership check doesn't trigger a second query. Saves one query on every route/step page load.

### A.4 — Single-query assessment aggregation

`ProfilesController#show` and `#load_achievements_data` previously ran `assessment_results.any?` + `.average(:score)` (2 queries). Collapsed into one `pick(COUNT(*), AVG(score))` call.

### A.5 — Cached expensive feed aggregates

`FeedController#index`:
- `@top_learners` (4-way cross-engine JOIN) now cached for 1h as ID list; user records re-hydrated outside the cache to avoid serializing full AR objects.
- `build_floating_thoughts` (top-comments query + potential fallback query, plus `:user` + `commentable: :learning_route` preloading) now cached for 30 min keyed by locale.

### Deferred

**Fragment caching on hot partials** — deliberately not added yet. The community counter columns (`likes_count`, `comments_count`) are updated via `update_all`, which does **not** bump `updated_at`. Naive fragment caching keyed on `[record]` would serve stale counts. A clean solution requires either (a) bumping `updated_at` in the counter callbacks (cheap, but may trigger other cache invalidations) or (b) including counter values in the cache key explicitly. Needs a design decision.

### Known pre-existing

`engines/learning_routes_engine/test/models/learning_routes_engine/learning_route_test.rb:20` "progress percentage calculation" expects `current_step / total_steps` but the method reads from the `route_steps` association — fails on an unsaved record with no associated steps. Behavior predates this audit; preserved intentionally.

## Phase B — Frontend (2026-04-17)

Biggest-impact change: lazy-loaded Stimulus. Several smaller housekeeping wins.

### B.1 — Stimulus switched to lazy loading

`app/javascript/controllers/index.js` now uses `lazyLoadControllersFrom` instead of `eagerLoadControllersFrom`. The 62 controllers totaling ~424 KB of source JS no longer all ship on every page; each controller loads via dynamic import on first appearance of its `data-controller` attribute.

Caveat: `interactive_lesson_controller#connect` calls `application.getControllerForElementAndIdentifier("lesson-quiz")` on line 104; there's a brief window where the lazy import hasn't resolved. The existing `if (quizCtrl)` guard means the worst case is the quiz not auto-activating on the first section (it activates on scroll/next section transition). Acceptable tradeoff.

### B.2 — Font loading cleanup

- Removed redundant `dns-prefetch` tags for origins already covered by `preconnect` in `application.html.erb` (preconnect supersedes dns-prefetch for the same host).
- Removed duplicate `preconnect` tag block in `application.html.erb` (was declared twice).
- Replaced invalid bare `<dns-prefetch href="...">` tags with `<link rel="dns-prefetch" href="...">` in `landing.html.erb`. The bare form is not valid HTML and was silently ignored by browsers.
- Narrowed DM Sans weight range from `300..700` to `400..700` across all layouts — weight 300 was not used anywhere in the project. Slightly smaller variable-font payload.

### B.3 — Turbo prefetch coverage

Added `<meta name="turbo-prefetch" content="true">` to `learning.html.erb` and `journey.html.erb` so hover on internal route/step links prewarms the navigation. Auth and onboarding layouts left out deliberately (linear flows, prefetching next step would be wasteful).

### B.4 — LCP element painted immediately

Hero `<h1>` on the landing page no longer uses `animate-enter delay-100`. Opacity 0→1 with a 100ms delay was delaying the Largest Contentful Paint element's visible paint by ~650ms. Other below-the-fold elements keep their staggered enter animations.

### B.5 — Fix missed N+1 in landing views (crosses with Phase A)

Added `LearningRoute#completed_steps_count` that uses the loaded `route_steps` association when available. Replaced `@active_route.route_steps.completed_steps.count` in `_hero.html.erb` and `_path_section.html.erb` — those scope chains bypassed the `includes(:route_steps)` already present in `LandingController`.

## Phase C — AI Latency (2026-04-17)

Audit found most of the infrastructure is already sound. One concrete config issue was blocking AI throughput under load.

### C.1 — Split Solid Queue worker pools

Previous config had a single worker pool with 3 threads handling all queues. A burst of AI generation jobs (5-30 s each) would starve the `default` queue, delaying mailers, streak updates, and the route-wizard orchestration jobs.

Split into two pools in `config/queue.yml`:
- `ai_requests` queue → 8 threads (IO-bound, benefits from parallelism)
- `default`, `low`, `low_priority` → 3 threads (fast jobs)

Throughput increase under concurrent AI load: up to ~2.6× (was capped at 3 concurrent regardless of queue; now up to 8 AI + 3 fast in parallel).

### C.2 — Audit findings that did NOT need fixing

- `ModelRouter::ROUTING_TABLE` already routes cheap tasks (grading, hints, step_quiz, simplify) to `gpt-4.1-mini` and heavy tasks to `gpt-5.2`. No mis-routed tasks.
- `CacheService` (Rails.cache via Solid Cache) is wired into both `Orchestrate.call` (sync path) and `AiRequestJob` (async path). Both fetch before model call and store after.
- Per-task TTLs in `CacheService::CACHE_TTLS` are sensible — never-cache set (`quick_grading`, `gap_analysis`, `exercise_hint`, `voice_evaluation`) correctly reflects tasks whose output must be fresh per student.
- `AiRequestJob` has exponential-backoff retry on `RequestError` (5 attempts) and fixed 30 s retry on `TimeoutError` (3 attempts), plus a 5-minute overall timeout via `Timeout.timeout`. Good.
- `rate_limit_for` uses Rails.cache atomic increment, with decrement on over-limit — correct atomic pattern.

### Deferred

- **`ContentEngine::ContentCache` model is unused.** The table exists in `db/schema.rb` and has model tests, but nothing references it outside its own test file — the actual AI response caching is done via `AiOrchestrator::CacheService` (Solid Cache / Rails.cache). Candidate for removal in a future cleanup (needs a migration).
- **`Orchestrate.run_agent` bypasses cache.** The agent path doesn't call `CacheService.fetch`. But grep shows no caller ever invokes `run_agent` — it's defined but not wired up. If enabled later, it needs cache integration.
- **Prompt prefix caching.** OpenAI auto-caches matching prompt prefixes ≥1024 tokens. The current `lesson_content.yml` interpolates variables (`{{user_name}}`, `{{user_level}}`, `{{difficulty}}`, `{{locale}}`) near the top of the system prompt, which breaks prefix matching across calls. Restructuring to put variables at the end would raise cache-hit rate. Not done now because it's a prompt-quality-risky change — needs a separate eval.
- **`DailyStreakCheckJob`** is documented to run via Solid Queue recurring at 6 am UTC, but `config/recurring.yml` only defines `clear_solid_queue_finished_jobs`. Either the job isn't scheduled, or it's scheduled elsewhere and the doc is stale. Worth verifying.

## Phase D — Holistic / Deployment (2026-04-17)

Smaller cleanup pass after the three targeted phases.

### D.1 — Production config: clean

Reviewed `config/environments/production.rb`. Already in good shape — eager_load on, perform_caching on, far-future immutable asset headers, solid_cache_store, solid_queue with dedicated queue database, jemalloc preloaded in Dockerfile, force_ssl + HSTS, DNS rebinding protection. No changes needed.

### D.2 — Thruster / Kamal: clean

Dockerfile starts via `./bin/thrust ./bin/rails server` — Thruster handles HTTP/2, gzip, and X-Sendfile acceleration in front of Puma. Two-stage build with bootsnap precompile. Kamal deploy config has `WEB_CONCURRENCY: auto` and `SOLID_QUEUE_IN_PUMA: "false"` (separate job container). No changes needed.

### D.3 — `DailyStreakCheckJob` wired into recurring.yml

`CLAUDE.md` documented this job running at 6 am UTC to reset `streak_freeze_used_today` for all users, but `config/recurring.yml` only scheduled the Solid Queue cleanup. Without the recurring entry, user streak freezes were never being reset — a functional gap, not just a perf one. Now scheduled via:

```yaml
daily_streak_check:
  class: DailyStreakCheckJob
  queue: low
  schedule: at 6am every day
```

### D.4 — Dropped unused `letter_opener` gem

Both dev and prod now send through Resend SMTP. `letter_opener` hadn't been required or configured anywhere (no `config.action_mailer.delivery_method = :letter_opener` in development.rb). Removed from Gemfile; `bundle install` pruned from lockfile. Shrinks the dev-group bundle by one gem.

## Optimization Opportunities for Future

1. **HTTP/2 Server Push**: Uncomment in production for critical assets
2. **CDN Integration**: Add asset_host for global distribution
3. **Image Optimization**: If raster images added, use `image_processing` gem
4. **Database Connection Pooling**: Increase PgBouncer connections if needed
5. **Query Result Caching**: Add Redis for expensive queries
6. **Partial Page Caching**: Use Turbo Streams for real-time updates with less overhead

## References

- [Rails Performance Optimization Guide](https://guides.rubyonrails.org/performance_testing.html)
- [Puma Configuration](https://puma.io/puma/Puma/DSL.html)
- [Propshaft Asset Pipeline](https://github.com/rails/propshaft)
- [Solid Cache/Queue Documentation](https://github.com/rails/solid_cache)
