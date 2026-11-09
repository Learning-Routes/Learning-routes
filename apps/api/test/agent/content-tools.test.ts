import { CONTENT_TOOLS } from "@learning-routes/core/studio/turn";
import { describe, expect, it } from "vitest";
import { CONTENT_MODEL_TOOLS } from "../../src/agent/content-tools";
import { TOOLS } from "../../src/mcp/tools";

describe("the assistant's content tools", () => {
  it("are the MCP's own tools, with the same descriptions", () => {
    expect(CONTENT_MODEL_TOOLS.map((tool) => tool.function.name)).toEqual([...CONTENT_TOOLS]);
    for (const tool of CONTENT_MODEL_TOOLS) {
      const mcp = TOOLS.find((each) => each.name === tool.function.name);
      expect(tool.function.description).toBe(mcp?.description);
      expect(tool.function.parameters).toMatchObject({ type: "object" });
    }
  });

  it("leave out publishing, uploads from an address, and anything that is not content", () => {
    const names = CONTENT_MODEL_TOOLS.map((tool) => tool.function.name);
    for (const left of ["publish_route", "list_spaces", "upload_asset", "upload_creation"]) {
      expect(names).not.toContain(left);
    }
  });
});
