// Addresses the platform keeps (Platform STEP 4 review): a space's slug is its host, so no
// space may take one of these. The one list: the web Worker reads it to route a host, the
// actions read it to refuse a slug, and a check in the database holds it for every other
// way in. No zod, so the Worker can load it.

export const RESERVED_SLUGS = [
  // The platform's own hosts.
  "app",
  "new",
  "www",
  "api",
  // Creators' interactive creations (Platform STEP 9 §1), now and if the host ever moves.
  "contenido",
  "content",
  // Mail: send is the return path of v1's mail, in use today.
  "mail",
  "email",
  "send",
  // Pages a platform commonly grows.
  "admin",
  "assets",
  "auth",
  "billing",
  "blog",
  "cdn",
  "docs",
  "help",
  "login",
  "pay",
  "staging",
  "static",
  "status",
  "support",
] as const;

export function isReservedSlug(slug: string): boolean {
  return (RESERVED_SLUGS as readonly string[]).includes(slug.toLowerCase());
}
