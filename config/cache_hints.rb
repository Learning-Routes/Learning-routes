# Cache Hints for Fragment Caching Strategy
# This file documents recommended caching points for views across the application
# to implement Russian doll caching patterns.

# === LANDING PAGE CACHING ===
# Fragment: _hero.html.erb
# Cache key: [@active_route, I18n.locale]
# TTL: 1 hour
# Invalidation: When route changes status/progress
#
# Example:
#   <% cache [@active_route, I18n.locale], expires_in: 1.hour do %>
#     <%= render "landing/hero" %>
#   <% end %>

# Fragment: _path_section.html.erb
# Cache key: [@route_nodes, I18n.locale]
# TTL: 2 hours
# Invalidation: When route nodes structure changes
#
# Note: @route_nodes is generated from I18n, safe to cache per locale

# Fragment: _how_it_works.html.erb
# Cache key: [I18n.locale, "how-it-works"]
# TTL: 1 day (static content)
# Invalidation: Only on i18n update
#
# This is entirely static, high-value caching target

# Fragment: _outcomes.html.erb
# Cache key: [I18n.locale, "outcomes"]
# TTL: 1 day
# Invalidation: Only on i18n update

# Fragment: _integrations.html.erb
# Cache key: [I18n.locale, "integrations"]
# TTL: 1 day
# Invalidation: Only on i18n update

# === SHARED COMPONENTS ===
# Fragment: shared/_navbar.html.erb
# Cache key: [current_user&.id, I18n.locale, current_theme]
# TTL: 15 minutes (user context changes)
# Note: Conditional rendering based on current_user requires careful key setup
#
# Example:
#   <% cache ["navbar", current_user&.id, I18n.locale, current_theme], expires_in: 15.minutes do %>
#     <%= render "shared/navbar" %>
#   <% end %>

# Fragment: shared/_footer.html.erb
# Cache key: [I18n.locale]
# TTL: 1 day (static content)
# Invalidation: Only on i18n update

# === IMPLEMENTATION GUIDE ===
#
# 1. Start with static sections (how_it_works, outcomes, integrations)
#    - Lowest risk, highest cache hit rate
#    - Use simple locale-based keys
#
# 2. Add user-dependent caching (hero, path_section)
#    - Include user.id or presence in cache key
#    - Use shorter TTL (1-2 hours)
#
# 3. Monitor cache hit rate:
#    - Enable: config.action_controller.enable_fragment_cache_logging = true
#    - Watch logs for "Read fragment cache" vs "Write fragment cache"
#
# 4. Use cache_if for conditional sections:
#    <% cache_if @show_premium_section, [@user, "premium"] do %>
#      ...
#    <% end %>
#
# 5. Test cache invalidation:
#    - Update route status and verify hero section reloads
#    - Change locale and verify all i18n-dependent caches bust
#    - Use Rails.cache.clear to reset for testing

# === CACHE KEY GENERATION ===
# Rails automatically includes:
# - Updated timestamp of model (if model is in key)
# - Rails version
# - View path
# - Locale (if using I18n)
#
# Example key for: cache [@route, I18n.locale]
# => "views/1234/route-5678/en-20260416120000/abcd1234ef..."
#
# Key busts automatically when:
# - @route.updated_at changes
# - Rails is upgraded
# - I18n.locale changes

# === SOLID_CACHE CONFIGURATION ===
# Cache store: :solid_cache_store (database-backed)
# Location: config/environments/production.rb
# Benefits:
# - Survives Rails restart
# - Shared across multiple processes
# - No separate Redis dependency
# - Automatic cleanup of expired entries

# === MONITORING IN PRODUCTION ===
# Check cache effectiveness:
#   Rails.cache.size           # Total cache entries
#   Rails.cache.clear          # Clear all caches
#   Rails.cache.read("key")    # Read specific entry
#   Rails.cache.write("key", value, expires_in: 1.hour)
#
# View cache table:
#   SELECT * FROM solid_cache_entries ORDER BY key LIMIT 20;
#   SELECT COUNT(*), SUM(LENGTH(value)) FROM solid_cache_entries;

# === BUST CACHE PROGRAMMATICALLY ===
# In controller or model:
#   Rails.cache.delete("views/#{@route.cache_key}")
#   # or
#   @route.touch # triggers cache key regeneration
#
# Automatic with callbacks:
#   class Route < ApplicationRecord
#     after_update :expire_caches
#
#     private
#     def expire_caches
#       Rails.cache.delete("route-#{self.id}")
#     end
#   end
