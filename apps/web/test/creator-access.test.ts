import { describe, expect, it } from "vitest";
import { creatorAccessOf } from "../app/app-api.server";

// What the gate screens read (Platform STEP 14): a creator is an owner or a coeditor somewhere.
describe("creatorAccessOf", () => {
  it("is creator for an owner or a coeditor, and none for anyone else", () => {
    expect(creatorAccessOf([{ role: "owner" }])).toBe("creator");
    expect(creatorAccessOf([{ role: "assistant" }, { role: "coeditor" }])).toBe("creator");
    expect(creatorAccessOf([{ role: "assistant" }])).toBe("none");
    expect(creatorAccessOf([])).toBe("none");
    expect(creatorAccessOf(null)).toBe("none");
  });
});
