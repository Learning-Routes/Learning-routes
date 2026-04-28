-- Provision the 4 databases Rails 8.1's multi-DB setup needs.
-- The postgres:16 image auto-creates POSTGRES_DB on first boot (we set that
-- to learning_routes_production), so this script only needs to add the three
-- companion databases (cache/queue/cable). Owner is the same POSTGRES_USER.
--
-- This script runs ONCE — only on first container start when the data volume
-- is empty. Subsequent boots reuse the persisted data and skip /docker-entrypoint-initdb.d.

CREATE DATABASE learning_routes_production_cache OWNER learning_routes;
CREATE DATABASE learning_routes_production_queue OWNER learning_routes;
CREATE DATABASE learning_routes_production_cable OWNER learning_routes;
