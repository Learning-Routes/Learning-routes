import type { SpaceRole } from "./domain";

// Member rules (Platform STEP 2 §3.3), checked before any membership changes:
// - only an owner grants the owner or coeditor role, to others or to themselves;
// - a space never loses its last owner: they cannot be removed or demoted.
// Who may change memberships at all is the permission table's call.

export interface Member {
  userId: string;
  role: SpaceRole;
}

export type MembershipChange =
  | { kind: "add"; userId: string; role: SpaceRole }
  | { kind: "set_role"; userId: string; role: SpaceRole }
  | { kind: "remove"; userId: string };

const OWNER_GRANTED: readonly SpaceRole[] = ["owner", "coeditor"];

/** Why a change to a space's members is refused, or null when it is allowed. */
export function checkMembershipChange(
  members: readonly Member[],
  actor: Member,
  change: MembershipChange,
): "forbidden" | "invalid" | "not_found" | "conflict" | null {
  const current = members.find((member) => member.userId === change.userId);
  if (change.kind === "add" ? current !== undefined : current === undefined) {
    return change.kind === "add" ? "conflict" : "not_found";
  }
  if (change.kind !== "remove" && OWNER_GRANTED.includes(change.role) && actor.role !== "owner") {
    return "forbidden";
  }
  const losesOwner =
    current?.role === "owner" && (change.kind === "remove" || change.role !== "owner");
  const owners = members.filter((member) => member.role === "owner").length;
  return losesOwner && owners === 1 ? "invalid" : null;
}
