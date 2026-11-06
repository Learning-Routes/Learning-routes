-- The content host (Platform STEP 9 §1) is an address the platform keeps: no space may take
-- contenido or content. The list is core's RESERVED_SLUGS, as in 0017; catalog-fence.test.ts holds it. Validated in 0033.
-- squawk-ignore ban-drop-constraint
alter table spaces drop constraint spaces_slug_not_reserved;
--> statement-breakpoint
alter table spaces add constraint spaces_slug_not_reserved
  check (lower(slug) not in ('app', 'new', 'www', 'api', 'contenido', 'content', 'mail', 'email', 'send', 'admin', 'assets', 'auth', 'billing', 'blog', 'cdn', 'docs', 'help', 'login', 'pay', 'staging', 'static', 'status', 'support')) not valid;
