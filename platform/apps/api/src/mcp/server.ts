import { type ActionResult, runAction } from "@learning-routes/core/actions/define";
import { purgeTagsAfter } from "@learning-routes/core/actions/purge-tags";
import { ACTIONS } from "@learning-routes/core/actions/registry";
import { McpServer } from "@modelcontextprotocol/server";
import type { DBAdapter } from "better-auth";
import pkg from "../../package.json" with { type: "json" };
import { takeFromWindow } from "../auth/rate-window";
import { queuePurge } from "../cache/purge";
import { pgRepos } from "../db/repos/index";
import { pgTenancy } from "../db/tenancy";
import { type Database, type Transaction, transactionAs } from "../db/with-db";
import { newId } from "../ids";
import { TOOLS, type Tool } from "./tools";

// The MCP server for one request (Platform STEP 5 §3). Every tool is a core action through
// runAction with via "mcp", so the permission table, row-level security and the action log
// hold for an assistant as they do for a button. No tool touches the database itself.

const LIST_TTL_MS = 60_000;
const PRIVATE = { ttlMs: LIST_TTL_MS, cacheScope: "private" } as const;
const WRITES_PER_MINUTE = 30;
const WRITES_PER_HOUR_IN_SPACE = 300;
const A_MINUTE_MS = 60_000;
const AN_HOUR_MS = 3_600_000;

const INSTRUCTIONS =
  "Learning Routes: routes are courses, made of modules, lessons and blocks, inside a creator's space. " +
  "Call list_spaces first. Writes change a draft that nobody sees; only publish_route changes what students see, so publish only when the person asks. " +
  "Every write takes draft_revision: read it from get_route, and use the one each write returns.";

export interface Caller {
  userId: string;
  clientId: string;
  scopes: Set<string>;
  adapter: Pick<DBAdapter, "incrementOne" | "findOne" | "create" | "updateMany">;
}

function ctxFor(tx: Transaction, caller: Caller) {
  return {
    actor: { via: "mcp" as const, userId: caller.userId, oauthClientId: caller.clientId },
    repos: pgRepos(tx),
    tenancy: pgTenancy(tx),
    clock: { now: () => Date.now() },
    ids: { newId },
  };
}

const failed = (text: string) => ({ isError: true, content: [{ type: "text" as const, text }] });

const SAY: Record<string, string> = {
  not_found: "not_found: there is no such thing in your spaces.",
  forbidden: "Your role in this space does not allow this.",
  position_taken: "Something else was just added in that place. Call get_route and try again.",
};

/** What a refusal says: plain, and with nothing of how the server is built. */
function refusalText(result: Exclude<ActionResult, { ok: true }>): string {
  if (result.code === "invalid_input") {
    return `This input is not valid: ${result.issues
      .slice(0, 10)
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join("; ")}`;
  }
  if (result.code === "conflict" || result.code === "invalid") {
    return `This was refused: ${result.message}.`;
  }
  return SAY[result.code] ?? "This was refused.";
}

/** Whether this client, and the space, still have room for one more write. */
async function hasRoomToWrite(db: Database, caller: Caller, tool: Tool, input: unknown) {
  const perToken = await takeFromWindow(
    caller.adapter,
    `mcp-writes:${caller.userId}:${caller.clientId}`,
    WRITES_PER_MINUTE,
    A_MINUTE_MS,
  );
  if (!perToken) {
    return false;
  }
  const target = ACTIONS[tool.action].target(tool.toAction(input) as never);
  const scope = await transactionAs(db, caller.userId, (tx) =>
    pgTenancy(tx).scopeOf(target, caller.userId),
  );
  return (
    scope === null ||
    takeFromWindow(
      caller.adapter,
      `mcp-writes:${scope.spaceId}`,
      WRITES_PER_HOUR_IN_SPACE,
      AN_HOUR_MS,
    )
  );
}

async function staleText(db: Database, caller: Caller, routeId: string): Promise<string> {
  const current = await transactionAs(db, caller.userId, (tx) =>
    runAction(ACTIONS, "route.get", { routeId }, ctxFor(tx, caller)),
  );
  const revision = current.ok ? (current.output as { revision: number }).revision : "unknown";
  return `The draft changed since you read it: its revision is now ${revision}. Call get_route to read it, then try again with that draft_revision.`;
}

/** The public address of a route just published. */
async function publicUrl(
  env: Env,
  tx: Transaction,
  caller: Caller,
  routeId: string,
  spaceId: string,
) {
  const ctx = ctxFor(tx, caller);
  const space = await runAction(ACTIONS, "space.get", { spaceId }, ctx);
  const route = await runAction(ACTIONS, "route.get", { routeId }, ctx);
  if (!(space.ok && route.ok)) {
    return null;
  }
  const { protocol } = new URL(env.APP_ORIGIN);
  const { slug } =
    (space.output as { space?: { slug: string } }).space ?? (space.output as { slug: string });
  return `${protocol}//${slug}.${(env as Env & { CREATOR_DOMAIN: string }).CREATOR_DOMAIN}/${(route.output as { route: { slug: string } }).route.slug}`;
}

async function callTool(env: Env, db: Database, caller: Caller, tool: Tool, input: unknown) {
  if (!caller.scopes.has(tool.scope)) {
    return failed(`This connection does not include ${tool.scope}.`);
  }
  if (tool.scope !== "routes:read" && !(await hasRoomToWrite(db, caller, tool, input))) {
    return failed("Too many changes for now. Wait a minute and try again.");
  }
  const { result, url } = await transactionAs(db, caller.userId, async (tx) => {
    const answered = await runAction(
      ACTIONS,
      tool.action,
      tool.toAction(input),
      ctxFor(tx, caller),
    );
    if (!(answered.ok && tool.action === "route.publish")) {
      return { result: answered, url: null };
    }
    const { routeId, spaceId } = answered.output as { routeId: string; spaceId: string };
    return { result: answered, url: await publicUrl(env, tx, caller, routeId, spaceId) };
  });
  if (!result.ok) {
    const routeId = (input as { route_id?: string }).route_id;
    return failed(
      result.code === "conflict" && routeId && "draft_revision" in (input as object)
        ? await staleText(db, caller, routeId)
        : refusalText(result),
    );
  }
  await queuePurge(env, purgeTagsAfter(tool.action, result.output));
  const structuredContent = tool.toOutput(result.output, url) as Record<string, unknown>;
  return {
    structuredContent,
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
  };
}

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
        "server/discover": PRIVATE,
      },
    },
  );
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
