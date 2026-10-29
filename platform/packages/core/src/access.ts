import type { ActorKind } from "./actions/define";
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

const PEOPLE = ["ui", "mcp"] as const;

export const PERMISSIONS = {
  // A review is the student's own recall, so no agent submits one.
  "review.submit": { owner: PEOPLE, coeditor: PEOPLE, assistant: PEOPLE, student: PEOPLE },
} as const satisfies Record<ActionName, Row>;

/** Whether a role in a space may call an action this way. */
export function can(role: SpaceRole | "operator", action: ActionName, via: ActorKind): boolean {
  if (role === "operator" || !Object.hasOwn(PERMISSIONS, action)) {
    return false;
  }
  const row: Row = PERMISSIONS[action];
  return row[role]?.includes(via) ?? false;
}
