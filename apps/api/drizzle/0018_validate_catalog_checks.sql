-- Separate from 0015, so the scan holds no lock that blocks writes (squawk).
alter table routes validate constraint routes_topic;
--> statement-breakpoint
alter table routes validate constraint routes_level;
--> statement-breakpoint
alter table routes validate constraint routes_price;
--> statement-breakpoint
alter table spaces validate constraint spaces_tagline_localized;
--> statement-breakpoint
alter table spaces validate constraint spaces_bio_localized;
--> statement-breakpoint
alter table spaces validate constraint spaces_slug_not_reserved;
