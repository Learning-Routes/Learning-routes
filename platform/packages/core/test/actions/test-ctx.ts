import type { ActorKind } from "../../src/actions/actor";
import type { Ctx, Tenancy } from "../../src/actions/define";
import type { SpaceRole } from "../../src/domain";
import { memoryRepos, memoryState } from "../repos/memory";

// The actions' tests run on the repositories' in-memory twin: one space with a
// published route, and two students, each enrolled in it.

export const NOW = Date.parse("2026-10-28T12:00:00Z");
export const SPACE = "0192d3a0-0000-7000-8000-0000000000a0";
export const ROUTE = "0192d3a0-0000-7000-8000-0000000000b0";
export const ENROLLMENTS: Record<string, string> = {
  "student-1": "0192d3a0-0000-7000-8000-0000000000e1",
  "student-2": "0192d3a0-0000-7000-8000-0000000000e2",
};
export const ENROLLMENT = ENROLLMENTS["student-1"] as string;

export type World = ReturnType<typeof memoryState>;

export function testWorld(): World {
  const state = memoryState();
  state.spaces.set(SPACE, {
    id: SPACE,
    slug: "space",
    name: { en: "Space" },
    defaultLocale: "en",
    locales: ["en"],
  });
  for (const [userId, enrollmentId] of Object.entries(ENROLLMENTS)) {
    state.members.set(`${SPACE}:${userId}`, { spaceId: SPACE, userId, role: "student" });
    state.enrollments.set(enrollmentId, {
      id: enrollmentId,
      spaceId: SPACE,
      routeId: ROUTE,
      userId,
      pinnedVersion: 1,
      status: "active",
    });
  }
  return state;
}

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

/** A tenancy read from the twin's own rows. */
function worldTenancy(world: World): Tenancy {
  return {
    scopeOf: async ({ kind, id }, userId) => {
      const spaceId =
        kind === "space"
          ? world.spaces.get(id)?.id
          : kind === "enrollment"
            ? world.enrollments.get(id)?.spaceId
            : world.drafts.get(id)?.spaceId;
      return spaceId === undefined
        ? null
        : { spaceId, role: world.members.get(`${spaceId}:${userId}`)?.role ?? null };
    },
  };
}

export function testCtx(
  via: ActorKind,
  world: World = testWorld(),
  userId = "student-1",
  options: { tenancy?: Tenancy; now?: number } = {},
): Ctx {
  let n = 0;
  return {
    actor: { via, userId },
    repos: memoryRepos(world, userId),
    tenancy: options.tenancy ?? worldTenancy(world),
    clock: { now: () => options.now ?? NOW },
    ids: {
      newId: () => {
        n += 1;
        return `id-${n}`;
      },
    },
  };
}
