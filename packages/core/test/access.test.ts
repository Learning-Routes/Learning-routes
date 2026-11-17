import { describe, expect, it } from "vitest";
import { can, PERMISSIONS } from "../src/access";
import { ACTOR_KINDS } from "../src/actions/actor";
import { ACTION_NAMES } from "../src/actions/names";
import { SpaceRole } from "../src/domain";

// The permission table (Platform STEP 2 §3.1), listed in full: every registered
// action against every role and every way in. A new action fails here until its
// row is written, and PERMISSIONS does not compile without one.
const ANY = ["ui", "mcp", "agent"];
const EVERYONE = { owner: ANY, coeditor: ANY, assistant: ANY, student: ANY };
const STAFF = { owner: ANY, coeditor: ANY, assistant: ANY };
const EDITORS = { owner: ANY, coeditor: ANY };
const COMMUNITY = { owner: ["ui"], coeditor: ["ui"], student: ["ui"] };
const EXPECTED: Record<string, Record<string, string[]>> = {
  "space.get": EVERYONE,
  "space.update": { owner: ["ui"] },
  "membership.add": { owner: ["ui"] },
  "route.create": EDITORS,
  "route.get": STAFF,
  "route.list": STAFF,
  "module.add": EDITORS,
  "lesson.add": EDITORS,
  "block.add": EDITORS,
  "route.publish": EDITORS,
  "enrollment.create": EVERYONE,
  "enrollment.upgrade": EVERYONE,
  "review.submit": EVERYONE,
  "catalog.request": { owner: ["ui"] },
  "catalog.withdraw": { owner: ["ui"] },
  "catalog.decide": {},
  "catalog.feature": {},
  "admin.overview": {},
  "application.decide": {},
  "application.invite": {},
  "invitation.accept": { student: ["ui"] },
  "space.create": {},
  "enrollment.list": EVERYONE,
  "lesson.read": EVERYONE,
  "lesson.play": EVERYONE,
  "tutor.ask": { owner: ["ui"], coeditor: ["ui"], assistant: [], student: ["ui"] },
  "lesson.answer": EVERYONE,
  "lesson.finish": EVERYONE,
  "space.list": { student: ["ui", "mcp"] },
  "route.update": EDITORS,
  "route.import": EDITORS,
  "route.set_price": { owner: ["ui"] },
  "route.upload": EDITORS,
  "creation.upload": EDITORS,
  "asset.upload": EDITORS,
  "route.preview": STAFF,
  "blocks.add": EDITORS,
  "block.remove": EDITORS,
  "connection.list": { student: ["ui"] },
  "connection.grant": { student: ["ui"] },
  "connection.revoke": { student: ["ui"] },
  // A route's community (Platform STEP 17): the app only, no assistant, no agent, no MCP.
  "community.list": COMMUNITY,
  "community.post": COMMUNITY,
  "community.reply": COMMUNITY,
  "community.useful": COMMUNITY,
  "community.delete": COMMUNITY,
  "community.report": COMMUNITY,
  "community.pin": { owner: ["ui"], coeditor: ["ui"] },
  "community.answer": { owner: ["ui"], coeditor: ["ui"] },
  "community.hide": { owner: ["ui"], coeditor: ["ui"] },
  "community.reports": {},
  "community.moderate": {},
  "community.follow": { student: ["ui"] },
  "community.block": { student: ["ui"] },
  "community.feed": { student: ["ui"] },
  "notification.list": { student: ["ui"] },
  "notification.read": { student: ["ui"] },
  "profile.get": { student: ["ui"] },
  "profile.update": { student: ["ui"] },
};

describe("can(role, action, via)", () => {
  it("has a row for every registered action, and only for those", () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual([...ACTION_NAMES].sort());
  });

  it.each([...ACTION_NAMES])(
    "%s: answers as the table says for every role and every via",
    (action) => {
      const actual = Object.fromEntries(
        SpaceRole.options.map((role) => [
          role,
          ACTOR_KINDS.filter((via) => can(role, action, via)),
        ]),
      );
      const expected = Object.fromEntries(
        SpaceRole.options.map((role) => [role, EXPECTED[action]?.[role] ?? []]),
      );
      expect(actual).toEqual(expected);
    },
  );

  it("gives the platform operator only the admin actions, through the app only", () => {
    const allowed = ACTION_NAMES.flatMap((action) =>
      ACTOR_KINDS.filter((via) => can("operator", action, via)).map((via) => `${action} ${via}`),
    );
    expect(allowed.sort()).toEqual([
      "admin.overview ui",
      "application.decide ui",
      "application.invite ui",
      "catalog.decide ui",
      "catalog.feature ui",
      "community.moderate ui",
      "community.reports ui",
      "space.create ui",
    ]);
  });

  it("refuses an action it does not know", () => {
    expect(can("owner", "space.delete", "ui")).toBe(false);
  });
});
