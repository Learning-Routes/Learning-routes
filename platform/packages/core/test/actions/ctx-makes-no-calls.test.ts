import { describe, expect, it } from "vitest";
import type { Ctx } from "../../src/actions/define";

// Platform STEP 2 §1.6: an action's run gets data and the store, never anything
// that can make a network call: no env, no fetch, no client, no AI. Each field of
// Ctx is reviewed here; a new one fails this file's typecheck until it is listed.
const REVIEWED = {
  actor: "who acts: a plain object",
  store: "the store for this transaction; no outside calls",
  now: "the time, a number",
  newId: "an id maker, pure",
} as const;

type Unreviewed = Exclude<keyof Ctx, keyof typeof REVIEWED>;
const everyFieldReviewed: [Unreviewed] extends [never] ? true : false = true;

describe("an action's context", () => {
  it("carries only reviewed fields, none of which can call out", () => {
    expect(everyFieldReviewed).toBe(true);
    expect(Object.keys(REVIEWED).sort()).toEqual(["actor", "newId", "now", "store"]);
  });
});
