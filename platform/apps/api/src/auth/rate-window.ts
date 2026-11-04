import type { DBAdapter } from "better-auth";

// A limit counted in Better Auth's own rate-limit table, so every Worker instance shares it.

/** How often one request races others for the count before it gives up. */
const ATTEMPTS = 3;

/**
 * One more in this key's current window, if it has room. Counted in Better Auth's own
 * rate-limit table with atomic conditional writes only: the count goes up only inside
 * a window with room; the first request creates the row once; a window that is over is
 * restarted only by the one request that still sees its old start. A request that
 * loses every race gets false, after a few tries.
 */
export async function takeFromWindow(
  adapter: Pick<DBAdapter, "incrementOne" | "findOne" | "create" | "updateMany">,
  key: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  const byKey = { field: "key", value: key };
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const now = Date.now();
    const counted = await adapter.incrementOne({
      model: "rateLimit",
      where: [
        byKey,
        { field: "lastRequest", operator: "gt", value: now - windowMs },
        { field: "count", operator: "lt", value: max },
      ],
      increment: { count: 1 },
      set: { lastRequest: now },
    });
    if (counted) {
      return true;
    }
    const row = await adapter.findOne<{ lastRequest: number | bigint }>({
      model: "rateLimit",
      where: [byKey],
    });
    if (row === null) {
      // The first one. A concurrent first one may create the row first: try again.
      const created = await adapter
        .create({ model: "rateLimit", data: { key, count: 1, lastRequest: now } })
        .catch(() => null);
      if (created !== null) {
        return true;
      }
      continue;
    }
    if (Number(row.lastRequest) > now - windowMs) {
      return false;
    }
    // The window is over. Restart it only if no one else has: the update matches
    // the old start, which a restart changes.
    const restarted = await adapter.updateMany({
      model: "rateLimit",
      where: [byKey, { field: "lastRequest", value: Number(row.lastRequest) }],
      update: { count: 1, lastRequest: now },
    });
    if (restarted === 1) {
      return true;
    }
  }
  return false;
}
