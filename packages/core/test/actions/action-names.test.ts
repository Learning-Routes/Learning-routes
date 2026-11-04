import { describe, expect, it } from "vitest";
import { ACTION_NAMES } from "../../src/actions/names";

// FOUNDATIONS.md §4b: an action is named noun.verb, lower case.
const NOUN_VERB = /^[a-z]+(\.[a-z]+)+$/;

describe("action names", () => {
  it.each(ACTION_NAMES)("%s is noun.verb, lower case", (name) => {
    expect(name).toMatch(NOUN_VERB);
  });
});
