# syntax=docker/dockerfile:1
# check=error=true

# This Dockerfile is designed for production, not development. Use with Kamal or build'n'run by hand:
# docker build -t learning_routes .
# docker run -d -p 80:80 -e RAILS_MASTER_KEY=<value from config/master.key> --name learning_routes learning_routes

# Make sure RUBY_VERSION matches the Ruby version in .ruby-version
ARG RUBY_VERSION=3.3.8
FROM docker.io/library/ruby:$RUBY_VERSION-slim AS base

# Rails app lives here
WORKDIR /rails

# Install base packages
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y curl libjemalloc2 libvips postgresql-client && \
    ln -s /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Set production environment variables and enable jemalloc for reduced memory usage and latency.
ENV RAILS_ENV="production" \
    BUNDLE_DEPLOYMENT="1" \
    BUNDLE_PATH="/usr/local/bundle" \
    BUNDLE_WITHOUT="development:test" \
    LD_PRELOAD="/usr/local/lib/libjemalloc.so"

# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build gems
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential git libpq-dev libyaml-dev pkg-config && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Install application gems
COPY vendor/ ./vendor/
COPY Gemfile Gemfile.lock ./

# Copy engine gemspecs so bundle install can resolve local path dependencies
COPY engines/core/core.gemspec engines/core/
COPY engines/core/lib/core/version.rb engines/core/lib/core/
COPY engines/learning_routes_engine/learning_routes_engine.gemspec engines/learning_routes_engine/
COPY engines/learning_routes_engine/lib/learning_routes_engine/version.rb engines/learning_routes_engine/lib/learning_routes_engine/
COPY engines/content_engine/content_engine.gemspec engines/content_engine/
COPY engines/content_engine/lib/content_engine/version.rb engines/content_engine/lib/content_engine/
COPY engines/assessments/assessments.gemspec engines/assessments/
COPY engines/assessments/lib/assessments/version.rb engines/assessments/lib/assessments/
COPY engines/ai_orchestrator/ai_orchestrator.gemspec engines/ai_orchestrator/
COPY engines/ai_orchestrator/lib/ai_orchestrator/version.rb engines/ai_orchestrator/lib/ai_orchestrator/
COPY engines/analytics/analytics.gemspec engines/analytics/
COPY engines/analytics/lib/analytics/version.rb engines/analytics/lib/analytics/

RUN bundle install && \
    rm -rf ~/.bundle/ "${BUNDLE_PATH}"/ruby/*/cache "${BUNDLE_PATH}"/ruby/*/bundler/gems/*/.git && \
    bundle exec bootsnap precompile -j 1 --gemfile

# Copy application code
COPY . .

# Precompile bootsnap code for faster boot times.
RUN bundle exec bootsnap precompile -j 1 app/ lib/

# Precompiling assets for production without requiring secret RAILS_MASTER_KEY
RUN SECRET_KEY_BASE_DUMMY=1 ./bin/rails assets:precompile

# Final stage for app image
FROM base

# Run and own only the runtime files as a non-root user for security
RUN groupadd --system --gid 1000 rails && \
    useradd rails --uid 1000 --gid 1000 --create-home --shell /bin/bash && \
    mkdir -p /rails/db /rails/log /rails/storage /rails/tmp && \
    chown -R rails:rails /rails

USER 1000:1000

# Copy built artifacts: gems, application
COPY --chown=rails:rails --from=build "${BUNDLE_PATH}" "${BUNDLE_PATH}"
COPY --chown=rails:rails --from=build /rails /rails

# Entrypoint prepares the database.
ENTRYPOINT ["/rails/bin/docker-entrypoint"]

# Start server via Thruster by default, this can be overwritten at runtime
EXPOSE 80
CMD ["./bin/thrust", "./bin/rails", "server"]
