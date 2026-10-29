import type { ActorKind } from "./actions/actor";
import type { ActionName } from "./actions/names";
import type { SpaceRole } from "./domain";

// Who may do what, the first fence (Platform STEP 2 §3.1). Each action lists, per
// role in the space, the ways in it may be called. A role or a way missing from a
// row is refused. The second fence, row-level security in Postgres, holds the same
// lines without relying on this one.
//
// - An owner does everything in their space.
// - A coeditor edits routes and content, but not memberships or pricing.
// - An assistant reads routes and their students' progress.
// - A student reads published versions they are enrolled in, and writes only their
//   own progress and reviews.
// - Memberships and pricing change only through the app (via "ui"), never an agent.
// - The platform operator may do nothing here yet.

type Row = Partial<Record<SpaceRole, readonly ActorKind[]>>;

const ANY_WAY = ["ui", "mcp", "agent"] as const;

const EVERYONE = {
  owner: ANY_WAY,
  coeditor: ANY_WAY,
  assistant: ANY_WAY,
  student: ANY_WAY,
} as const;
const STAFF = { owner: ANY_WAY, coeditor: ANY_WAY, assistant: ANY_WAY } as const;
const EDITORS = { owner: ANY_WAY, coeditor: ANY_WAY } as const;

export const PERMISSIONS = {
  "space.get": EVERYONE,
  // Memberships change only in the app, and only by an owner.
  "membership.add": { owner: ["ui"] },
  // route.create itself refuses a paid route from anywhere but the app.
  "route.create": EDITORS,
  "route.get": STAFF,
  "route.list": STAFF,
  "module.add": EDITORS,
  "lesson.add": EDITORS,
  "block.add": EDITORS,
  "route.publish": EDITORS,
  // On the actor's own behalf, allowed as the student role it gives a newcomer.
  "enrollment.create": EVERYONE,
  // Each acts only on the actor's own enrollment.
  "enrollment.upgrade": EVERYONE,
  "review.submit": EVERYONE,
} as const satisfies Record<ActionName, Row>;

/** Whether a role in a space may call an action this way. */
export function can(role: SpaceRole | "operator", action: string, via: ActorKind): boolean {
  if (role === "operator" || !Object.hasOwn(PERMISSIONS, action)) {
    return false;
  }
  const row: Row = PERMISSIONS[action as ActionName];
  return row[role]?.includes(via) ?? false;
}
