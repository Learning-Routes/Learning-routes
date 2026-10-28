import type { ActorKind, Ctx, Store } from "../../src/actions/define";

/** The tests' store: a Map. The API brings real storage in STEP 47. */
export function memoryStore(): Store {
  const rows = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => rows.get(key) as T | undefined,
    put: async <T>(key: string, value: T) => {
      // A copy, as a database would keep: later changes to the value do not reach the row.
      rows.set(key, JSON.parse(JSON.stringify(value)));
    },
  };
}

export const NOW = Date.parse("2026-10-28T12:00:00Z");

export function testCtx(via: ActorKind, store: Store = memoryStore(), userId = "student-1"): Ctx {
  let n = 0;
  return {
    actor: { via, userId },
    store,
    now: NOW,
    newId: () => {
      n += 1;
      return `id-${n}`;
    },
  };
}
