// Better Auth's in-memory database, left out of the Workers (wrangler.jsonc "alias"). Better Auth
// loads it only when no database is given, and every Worker here always gives Postgres; if one
// ever does not, it fails loudly instead of keeping sessions in memory.

export function memoryAdapter(_db?: unknown): never {
  throw new Error("Better Auth was built without a database");
}
