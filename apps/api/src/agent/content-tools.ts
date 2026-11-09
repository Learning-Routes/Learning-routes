import type { ModelTool } from "@learning-routes/core/ai/gate";
import { CONTENT_TOOLS, type ContentTool } from "@learning-routes/core/studio/turn";
import * as z from "zod";
import type { Tool } from "../mcp/tool";
import { TOOLS } from "../mcp/tools";

// The content tools the assistant shares with the MCP (Platform STEP 10 §1): the very same
// definitions, described to the model as functions. One tool surface, one way into the data.

export function contentTool(name: ContentTool): Tool {
  const found = TOOLS.find((tool) => tool.name === name);
  if (!found) {
    throw new Error(`the MCP has no tool ${name}`);
  }
  return found;
}

export const CONTENT_MODEL_TOOLS: ModelTool[] = CONTENT_TOOLS.map((name) => {
  const tool = contentTool(name);
  return {
    type: "function",
    function: {
      name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.input, { io: "input", unrepresentable: "any" }) as Record<
        string,
        unknown
      >,
    },
  };
});
