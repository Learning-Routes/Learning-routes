# Query Optimization Guidelines
# Use this file as a reference for optimizing N+1 queries and slow queries

# === ACTIVE RECORD QUERY OPTIMIZATION PATTERNS ===

# 1. AVOID N+1 WITH includes/preload/eager_load
#
# BAD:
#   routes = LearningRoute.all
#   routes.each { |r| puts r.route_steps.count }  # 1 query + N queries
#
# GOOD:
#   routes = LearningRoute.includes(:route_steps)
#   routes.each { |r| puts r.route_steps.count }  # Only 2 queries

# 2. WHEN TO USE INCLUDES vs PRELOAD vs EAGER_LOAD
#
# includes:  Use most of the time (automatically chooses best strategy)
#   LearningRoute.includes(:route_steps, :learning_profile)
#
# preload:   When you NEED separate queries (includes sometimes JOINs)
#   LearningRoute.preload(:route_steps, :route_comments)
#
# eager_load: When you need to apply conditions on joined tables
#   LearningRoute.eager_load(:route_steps)
#                .where("route_steps.status = ?", "completed")

# 3. BATCH LOADING WITH find_each (for large datasets)
#
# BAD (loads all into memory):
#   User.all.each { |u| update_user(u) }
#
# GOOD (processes in 1000-record batches):
#   User.find_each(batch_size: 500) { |u| update_user(u) }

# 4. USE SELECT TO REDUCE COLUMNS
#
# BAD:
#   User.all  # Loads all columns
#
# GOOD (if you only need id and name):
#   User.select(:id, :name)

# 5. COUNT WITHOUT LOADING ALL RECORDS
#
# BAD:
#   User.all.count  # Loads all records, then counts
#
# GOOD:
#   User.count     # Uses SQL COUNT

# 6. AGGREGATE QUERIES
#
# Use pluck for single values:
#   User.pluck(:id, :email)  # Returns array of [id, email] tuples
#
# Use group + count for aggregations:
#   RouteStep.group(:status).count
#   # => {"completed" => 50, "in_progress" => 30, "locked" => 20}

# === DEVELOPMENT TOOLS FOR DETECTING N+1 ===

# 1. PROSOPITE (added to Gemfile)
#
# Automatically warns in logs when N+1 detected
# Look for: "[PROSOPITE] Your request was N+1 query prone"
#
# Can disable specific warnings in tests:
#   Prosopite.capture do
#     # your code
#   end

# 2. ACTIVE RECORD STRICT LOADING (in development)
#
# File: config/environments/development.rb
# Already configured: config.active_record.strict_loading_by_default = true
#
# Raises error if you lazy-load an association:
#   user = User.first
#   user.posts.count  # ERROR: posts association not preloaded
#                     # Fix: User.includes(:posts).first
#
# Disable for specific queries:
#   User.strict_loading(false).first.posts.count

# 3. QUERY LOG TAGS (in development)
#
# File: config/environments/development.rb
# Already configured: config.active_record.query_log_tags_enabled = true
#
# Shows file:line of code that triggered query:
#   [["app/controllers/landing_controller.rb:26"]] SELECT...

# === COMMON QUERY PATTERNS IN LEARNING ROUTES ===

# Pattern: Get user's active route with steps
#
# BAD (N+1 for each step):
#   user = User.find(id)
#   route = user.learning_route
#   route.route_steps.each { |s| puts s.content }
#
# GOOD (2 queries total):
#   user = User.includes(learning_route: :route_steps).find(id)
#   # Then access: user.learning_route.route_steps

# Pattern: Count completed assessments per user
#
# BAD:
#   User.all.map { |u| u.assessment_results.where(passed: true).count }
#
# GOOD:
#   User.joins(:assessment_results)
#       .where(assessment_results: { passed: true })
#       .group('users.id')
#       .count

# Pattern: List recent routes with step count
#
# BAD (N+1 for counting steps):
#   LearningRoute.recent(10).map { |r| [r.title, r.route_steps.count] }
#
# GOOD (uses GROUP BY):
#   LearningRoute.select('learning_routes.*, COUNT(route_steps.id) as step_count')
#                .joins(:route_steps)
#                .recent(10)
#                .group('learning_routes.id')

# === QUERY OPTIMIZATION CHECKLIST ===

# Before deploying a new feature:
# [ ] Check controller for eager_load (includes/preload)
# [ ] Test with Prosopite - no "[PROSOPITE]" warnings in logs
# [ ] Enable strict_loading - no "lazy load" errors
# [ ] Use EXPLAIN ANALYZE for queries with JOINs
# [ ] Verify indexes exist on foreign keys
# [ ] Test with realistic data volume (not just fixtures)

# === INDEX CREATION ===

# Already created (see db/migrate/20260307010000_add_missing_query_indexes.rb):
# - idx_assessment_results_user_timeline: (user_id, created_at)
# - idx_user_engagements_streak_freeze_active: (streak_freeze_used_today) WHERE active
# - idx_comments_commentable_timeline: (commentable_type, commentable_id, created_at)
# - idx_activities_user_action_timeline: (user_id, action, created_at)

# To add more indexes for common queries:
#
#   class AddMyQueryIndex < ActiveRecord::Migration[8.1]
#     def change
#       add_index :routes, [:user_id, :status, :created_at],
#                 name: "idx_routes_user_status_timeline"
#     end
#   end

# === SLOW QUERY DETECTION ===

# Enable slow query log in PostgreSQL:
#   ALTER SYSTEM SET log_min_duration_statement = 1000;  -- 1000ms threshold
#   SELECT pg_reload_conf();
#
# Or in config/database.yml:
#   production:
#     adapter: postgresql
#     log_query_time_ms: 1000  # Log queries taking > 1 second

# View slow queries in production:
#   SELECT query, mean_time, calls FROM pg_stat_statements
#   WHERE mean_time > 1000
#   ORDER BY mean_time DESC;

# === MONITORING IN PRODUCTION ===

# Check which queries are slowest:
#   SELECT query, calls, total_time, mean_time
#   FROM pg_stat_statements
#   WHERE query NOT LIKE '%pg_stat_statements%'
#   ORDER BY mean_time DESC
#   LIMIT 10;

# Clear statistics (after optimization):
#   SELECT pg_stat_statements_reset();

# === RAILS CONSOLE QUERY ANALYSIS ===

# In production console:
#   irb> ActiveRecord::Base.logger = Logger.new(STDOUT)
#   irb> routes = LearningRoute.includes(:route_steps).where(status: 'active')
#   # Shows all SQL queries executed
#
# Check query count:
#   irb> ActiveRecord::Base.connection.query_cache_enabled = false
#   irb> puts ActiveRecord::Base.connection.query_cache.size
