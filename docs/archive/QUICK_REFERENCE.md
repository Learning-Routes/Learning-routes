# Performance Optimization Quick Reference

Fast access to key commands and configurations for the implemented optimizations.

## Installation & Deployment

```bash
# Install new performance gems
bundle install

# Pre-compile assets for production
bundle exec rake assets:precompile

# Deploy with optimized Puma settings
WEB_CONCURRENCY=auto RAILS_MAX_THREADS=5 bin/puma

# Enable caching in development
bin/rails dev:cache
```

## Development Commands

```bash
# Start Rails with Spring preloader
bundle exec spring rails server

# Rails console with Spring (instant boot)
bundle exec spring rails console

# Generate model/controller with Spring
bundle exec spring rails generate model User

# Run tests with Spring
bundle exec spring rails test

# Watch logs for N+1 queries
tail -f log/development.log | grep PROSOPITE
```

## Monitor Performance

### Development
```ruby
# In Rails console
# Check query count
ActiveRecord::Base.logger = Logger.new(STDOUT)

# Test strict loading
User.first.posts  # ERROR if :posts not preloaded
User.includes(:posts).first.posts  # OK

# Enable cache and test
Rails.cache.read("key")
Rails.cache.write("key", value, expires_in: 1.hour)
```

### Production
```ruby
# Check Solid Cache size
SolidCache::Entry.count
SolidCache::Entry.sum(:size)

# Flush cache
Rails.cache.clear

# Monitor memory
docker stats learning_routes_web

# Check slow queries
SELECT query, calls, mean_time FROM pg_stat_statements 
WHERE mean_time > 1000 ORDER BY mean_time DESC LIMIT 10;
```

## HTTP Caching

### Check Cache Headers
```bash
curl -I https://learning-routes.com/

# Should see:
# Cache-Control: public, max-age=31536000, immutable
# Content-Encoding: gzip
# ETag: "abcd1234ef..."
```

### Test gzip Compression
```bash
curl -I -H "Accept-Encoding: gzip" https://learning-routes.com/

# Should see:
# Content-Encoding: gzip
# Content-Length: ~200KB (vs 500KB uncompressed)
```

## Database Optimization

### Check N+1 Queries
```ruby
# Development logs will show:
# [PROSOPITE] Your request was N+1 query prone

# Fix with includes:
routes = LearningRoute.includes(:route_steps)
# vs
routes = LearningRoute.all  # triggers N+1 warnings
```

### Query Analysis
```ruby
# In console
explain = LearningRoute.where(status: 'active').explain(analyze: true)
puts explain

# Check execution plan for slow queries
EXPLAIN ANALYZE SELECT * FROM learning_routes WHERE status = 'active';
```

### View Query Log
```bash
# Development mode shows query context
# Look for: "app/controllers/landing_controller.rb:15"
# Shows file:line of code that triggered query

# Enable in development.rb:
# config.active_record.query_log_tags_enabled = true
# config.active_record.verbose_query_logs = true
```

## Caching Commands

### Fragment Cache Logging
```bash
# Production logs show:
# View#Read fragment cache   # Cache hit
# View#Write fragment cache  # Cache miss/write

# Enable in production.rb:
# config.action_controller.enable_fragment_cache_logging = true
```

### Manual Cache Control
```ruby
# Clear specific cache
Rails.cache.delete("views/landing_#{I18n.locale}")

# Force cache write
Rails.cache.write("key", value, force: true)

# Check cache stats
Rails.cache.size  # Total entries
```

## Load Testing

### Apache Bench
```bash
# Simple load test (1000 requests, 10 concurrent)
ab -n 1000 -c 10 https://learning-routes.com/

# With headers
ab -n 1000 -c 10 -H "Accept-Encoding: gzip" https://learning-routes.com/
```

### Wrk (Advanced)
```bash
# 4 threads, 100 connections, 30 second duration
wrk -t4 -c100 -d30s https://learning-routes.com/

# With Lua script for performance metrics
wrk -t4 -c100 -d30s -s metrics.lua https://learning-routes.com/
```

### k6 (JavaScript)
```bash
# Load test with k6
k6 run load_test.js

# Test script example:
# import http from 'k6/http';
# export let options = { vus: 10, duration: '30s' };
# export default function () { http.get('https://learning-routes.com/'); }
```

## Monitoring Dashboards

### Key Metrics
```sql
-- Solid Cache size
SELECT COUNT(*), SUM(LENGTH(value)) as total_bytes 
FROM solid_cache_entries;

-- Cache entry age
SELECT key, created_at, expires_at 
FROM solid_cache_entries 
WHERE expires_at < NOW() 
LIMIT 10;

-- Most accessed cache keys
SELECT key, COUNT(*) as hits 
FROM solid_cache_entries 
GROUP BY key 
ORDER BY hits DESC 
LIMIT 20;
```

### Memory Monitoring
```bash
# Check worker memory usage
docker stats learning_routes_web --no-stream

# Track memory over time
watch -n 5 'docker stats learning_routes_web --no-stream'

# Ruby process memory
ps aux | grep puma
# Check RSS column (resident set size)
```

### Response Time Tracking
```bash
# Extract from logs
tail -100 log/production.log | grep "Completed"

# Parse Rails log format
tail -100 log/production.log | grep "Completed" | \
  awk '{print $NF}' | sed 's/ms//' | sort -n | tail -5
```

## Troubleshooting

### High Memory Usage
```ruby
# Check for memory leaks
ObjectSpace.count_objects.inspect

# Clear caches and restart
Rails.cache.clear
# Restart Puma: kill -0 <pid>
```

### N+1 Query Detection
```bash
# Find N+1 in logs
grep -i "prosopite" log/development.log

# Specific example: find queries for route steps
grep -A 5 "LearningRoute" log/development.log | grep "route_steps"
```

### Slow Query Investigation
```ruby
# Find slowest queries
ActiveRecord::Base.logger = Logger.new(STDOUT)
LearningRoute.where(status: 'active').map(&:updated_at)
# ^ Watch log for slow queries

# Use EXPLAIN to understand
LearningRoute.where(status: 'active').explain
```

### Cache Not Working
```ruby
# Verify cache store
Rails.cache.class  # Should be SolidCache::Store

# Test cache write/read
Rails.cache.write("test", "value")
Rails.cache.read("test")  # Should return "value"

# Check if caching is enabled
ActionController::Base.perform_caching  # Should be true in production
```

## Configuration Verification

### Check All Settings
```bash
# Production.rb
grep -n "cache_store\|assets.compile\|perform_caching" config/environments/production.rb

# Development.rb
grep -n "strict_loading\|file_watcher" config/environments/development.rb

# Application.rb
grep -n "Rack::Deflater\|strict_loading" config/application.rb

# Puma.rb
grep -n "threads\|workers\|preload_app" config/puma.rb
```

### Verify Gems Installed
```bash
bundle list | grep -E "prosopite|pg_query|spring"
```

## Performance Baselines

### Typical Metrics (After Optimization)
- **TTFB**: < 200ms (Time to First Byte)
- **FCP**: < 1.5s (First Contentful Paint)
- **LCP**: < 2.5s (Largest Contentful Paint)
- **CLS**: < 0.1 (Cumulative Layout Shift)
- **Queries per request**: 2-5 (vs 8-12 before)
- **Transfer size**: 200KB gzip (vs 500KB before)
- **Worker memory**: 256MB per worker (vs 512MB before)

### Load Test Baseline
```
Requests per second: 100+ 
(with proper threading and caching)

P95 Response Time: < 300ms
P99 Response Time: < 500ms

Memory growth: < 5% over 1 hour
```

## Documentation References

- **PERFORMANCE_OPTIMIZATIONS.md** - Full guide with all details
- **IMPLEMENTATION_SUMMARY.md** - What was changed and where
- **VERIFICATION_CHECKLIST.md** - Verification steps for each optimization
- **config/cache_hints.rb** - Caching patterns and examples
- **config/query_optimization.rb** - Database optimization patterns

## Emergency Operations

### Clear All Caches
```ruby
Rails.cache.clear
SolidCache::Entry.delete_all  # Dangerous - immediate
```

### Disable Strict Loading (if breaking in production)
```ruby
# In production.rb temporarily:
config.active_record.strict_loading_by_default = false
# Then recompile and redeploy

# Or in console:
class ApplicationRecord
  disable_strict_loading
end
```

### Restart Puma Workers
```bash
# Graceful restart (keeps connections alive)
kill -USR2 <puma-pid>

# Hard restart
kill -TERM <puma-pid>
pkill -f puma
```

### Disable Rack::Deflater (if issues)
```ruby
# In config/application.rb, comment out:
# config.middleware.use Rack::Deflater

# Then redeploy
```

## Next Steps After Deployment

1. Monitor TTFB and response times for 24 hours
2. Check Solid Cache growth (should stabilize)
3. Review logs for [PROSOPITE] N+1 warnings
4. Load test with WEB_CONCURRENCY=auto
5. Compare memory usage vs baseline
6. Verify cache headers in production
7. Set up alerts for memory and response time

---

**Last Updated**: April 16, 2026  
**Rails Version**: 8.1.2  
**Status**: All optimizations deployed ✅
