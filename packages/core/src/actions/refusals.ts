import { CREATOR_ACTIONS, isCreatorRole } from "../access";
import type { SpaceRole } from "../domain";

/** Why an action says no on purpose; runAction reports it as a result. */
export type RefusalCode =
  | "not_found"
  | "forbidden"
  | "creator_required"
  | "invalid"
  | "conflict"
  | "position_taken";

/** A refusal an action raises on purpose; runAction reports it as a result. */
export class ActionError extends Error {
  override name = "ActionError";
  constructor(
    readonly code: RefusalCode,
    message: string,
  ) {
    super(message);
  }
}

// Building takes being a creator, an owner or a coeditor (Platform STEP 14). Outside the space it
// is said from the actor alone, never the row, so it tells nobody whether a space exists: a creator
// elsewhere still hears not_found.

export const CREATOR_REQUIRED = {
  ok: false,
  code: "creator_required",
  message: "only a creator in this space may do this",
} as const;

/** For someone outside the row's space: creator_required if they build nowhere, else null. */
export async function refusedOutside(name: string, isCreator: () => Promise<boolean>) {
  return CREATOR_ACTIONS.has(name) && !(await isCreator()) ? CREATOR_REQUIRED : null;
}

/** For a member: creator_required if a creator action meets a role that does not build. */
export const refusedInside = (name: string, role: SpaceRole) =>
  CREATOR_ACTIONS.has(name) && !isCreatorRole(role) ? CREATOR_REQUIRED : null;
