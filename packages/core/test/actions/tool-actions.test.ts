import { describe, expect, it } from "vitest";
import { ACTIONS } from "../../src/actions/registry";
import { TOOL_ACTIONS } from "../../src/actions/tool-actions";

// The agent Worker's narrow registry holds the registry's own actions, never a copy that drifts.
describe("the tools' actions", () => {
  it.each(Object.entries(TOOL_ACTIONS))("%s is the registry's own", (name, action) => {
    expect(action).toBe(ACTIONS[name as keyof typeof ACTIONS]);
  });
});
