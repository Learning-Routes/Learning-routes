import { describe, expect, it } from "vitest";
import { checkMembershipChange, type Member } from "../src/memberships";

// Member rules (Platform STEP 2 §3.3): only an owner grants the owner or coeditor
// role, and a space never loses its last owner.
const OWNER: Member = { userId: "ana", role: "owner" };
const COEDITOR: Member = { userId: "ben", role: "coeditor" };
const STUDENT: Member = { userId: "cai", role: "student" };
const members = [OWNER, COEDITOR, STUDENT];

describe("checkMembershipChange", () => {
  it("lets an owner add anyone in any role", () => {
    for (const role of ["owner", "coeditor", "assistant", "student"] as const) {
      expect(
        checkMembershipChange(members, OWNER, { kind: "add", userId: "dan", role }),
      ).toBeNull();
    }
  });

  it("refuses to anyone but an owner the owner and coeditor roles, for others or themselves", () => {
    for (const role of ["owner", "coeditor"] as const) {
      expect(checkMembershipChange(members, COEDITOR, { kind: "add", userId: "dan", role })).toBe(
        "forbidden",
      );
      expect(
        checkMembershipChange(members, COEDITOR, {
          kind: "set_role",
          userId: "ben",
          role: "owner",
        }),
      ).toBe("forbidden");
      expect(
        checkMembershipChange(members, STUDENT, { kind: "set_role", userId: "cai", role }),
      ).toBe("forbidden");
    }
  });

  it("never removes or demotes the last owner, even by themselves", () => {
    expect(checkMembershipChange(members, OWNER, { kind: "remove", userId: "ana" })).toBe(
      "invalid",
    );
    expect(
      checkMembershipChange(members, OWNER, { kind: "set_role", userId: "ana", role: "coeditor" }),
    ).toBe("invalid");
  });

  it("lets an owner step down once another owner exists", () => {
    const two = [...members, { userId: "dan", role: "owner" } as const];
    expect(
      checkMembershipChange(two, OWNER, { kind: "set_role", userId: "ana", role: "coeditor" }),
    ).toBeNull();
    expect(checkMembershipChange(two, OWNER, { kind: "remove", userId: "ana" })).toBeNull();
  });

  it("refuses a change to someone who is not a member, or an add of one who is", () => {
    expect(checkMembershipChange(members, OWNER, { kind: "remove", userId: "zed" })).toBe(
      "not_found",
    );
    expect(
      checkMembershipChange(members, OWNER, { kind: "add", userId: "cai", role: "assistant" }),
    ).toBe("conflict");
  });
});
