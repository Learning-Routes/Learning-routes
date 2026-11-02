import type { ActorKind } from "../../src/actions/actor";
import type { Ctx, Store, Tenancy } from "../../src/actions/define";
import type { SpaceRole } from "../../src/domain";

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

/** The tests' tenancy: which space each row is in ("kind:id"), and roles ("space:user"). */
export function memoryTenancy(map: {
  rows: Record<string, string>;
  roles: Record<string, SpaceRole>;
}): Tenancy {
  return {
    scopeOf: async ({ kind, id }, userId) => {
      const spaceId = map.rows[`${kind}:${id}`];
      return spaceId === undefined
        ? null
        : { spaceId, role: map.roles[`${spaceId}:${userId}`] ?? null };
    },
  };
}

export const ENROLLMENT = "0192d3a0-0000-7000-8000-0000000000e1";

/** Every test student is a student of space-1, enrolled through ENROLLMENT. */
const everyoneIsAStudent: Tenancy = {
  scopeOf: async ({ kind, id }) =>
    kind === "enrollment" && id === ENROLLMENT ? { spaceId: "space-1", role: "student" } : null,
};

export function testCtx(
  via: ActorKind,
  store: Store = memoryStore(),
  userId = "student-1",
  tenancy: Tenancy = everyoneIsAStudent,
): Ctx {
  let n = 0;
  return {
    actor: { via, userId },
    store,
    tenancy,
    now: NOW,
    newId: () => {
      n += 1;
      return `id-${n}`;
    },
  };
}
