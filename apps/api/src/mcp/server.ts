import { McpServer } from "@modelcontextprotocol/server";
import pkg from "../../package.json" with { type: "json" };
import type { Database } from "../db/with-db";
import { type Caller, callTool } from "./call-tool";
import { registerGuides } from "./guides";
import { failed } from "./tool";
import { TOOLS } from "./tools";

// The MCP server for one request (Platform STEP 5 §3). Every tool is a core action through
// callTool with via "mcp", so the permission table, row-level security and the action log
// hold for an assistant as they do for a button. No tool touches the database itself.

const LIST_TTL_MS = 60_000;
const PRIVATE = { ttlMs: LIST_TTL_MS, cacheScope: "private" } as const;
const INSTRUCTIONS =
  "Routes here are courses, made of modules, lessons and blocks, inside a creator's space. " +
  "You build them for the creator: this is how routes get made here. Call list_spaces first. " +
  "To write a new route, call get_route_format, then import_route with the whole route, or build it " +
  "step by step with create_route, add_module, add_lesson and add_blocks. " +
  "When the creator already has the course written, use upload_document with their words as they " +
  "are. An interactive creation they made, like a piano or a game in one HTML file, goes in " +
  "with upload_creation exactly as it is: never offer to rebuild it. Their images, sound and " +
  "video go in with upload_asset. Give the creator the preview_url, and publish only when they ask. " +
  "Every write takes draft_revision: read it from get_route, and use the one each write returns.";

export function createServer(env: Env, db: Database, caller: Caller): McpServer {
  const server = new McpServer(
    { name: "learning-routes", version: pkg.version },
    {
      instructions: INSTRUCTIONS,
      cacheHints: {
        "tools/list": PRIVATE,
        "resources/list": PRIVATE,
        "resources/templates/list": PRIVATE,
        "prompts/list": PRIVATE,
        "resources/read": PRIVATE,
        "server/discover": PRIVATE,
      },
    },
  );
  registerGuides(server);
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.input,
        outputSchema: tool.output,
        annotations: tool.annotations,
      },
      async (input: unknown) => {
        try {
          return await callTool(env, db, caller, tool, input);
        } catch (error) {
          console.error(
            JSON.stringify({
              message: "mcp tool failed",
              tool: tool.name,
              error: error instanceof Error ? error.name : "unknown",
            }),
          );
          return failed("Something went wrong on our side. Try again in a moment.");
        }
      },
    );
  }
  return server;
}
