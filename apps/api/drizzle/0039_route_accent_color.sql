ALTER TABLE "routes" ADD COLUMN "accent_color" text;--> statement-breakpoint
-- A route's own accent (Platform STEP 12). Validated in 0040, apart, so no write waits on the scan.
ALTER TABLE "routes" ADD CONSTRAINT "routes_accent_color" CHECK ("routes"."accent_color" ~ '^#[0-9a-f]{6}$') NOT VALID;
