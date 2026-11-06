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
import { storeAfterCommit } from "../files";
import { newId } from "../ids";
import { fetchAsset } from "./fetch-asset";
import { registerGuides } from "./guides";
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
  "Routes here are courses, made of modules, lessons and blocks, inside a creator's space. " +
  "You build them for the creator: this is how routes get made here. Call list_spaces first. " +
  "To write a new route, call get_route_format, then import_route with the whole route, or build it " +
  "step by step with create_route, add_module, add_lesson and add_blocks. " +
  "When the creator already has the course written, use upload_document with their words as they " +
  "are. An interactive creation they made, like a piano or a game in one HTML file, goes in " +
  "with upload_creation exactly as it is: never offer to rebuild it. Their images, sound and " +
  "video go in with upload_asset. Give the creator the preview_url, and publish only when they ask. " +
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
    return result.message.startsWith("Nothing")
      ? result.message
      : `This was refused: ${result.message}.`;
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
  if (tool.action === null) {
    return true;
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

const PREVIEWED: readonly string[] = [
  "route.upload",
  "route.import",
  "route.get",
  "creation.upload",
];

/** Where the person sees the draft (Platform STEP 8 §3). */
function previewOf(env: Env, output: unknown) {
  const { routeId, route } = output as { routeId?: string; route?: { id: string } };
  return `${env.APP_ORIGIN}/creador/rutas/${routeId ?? route?.id}/vista-previa`;
}

const SPACE_OPTIONAL: readonly string[] = ["upload_document", "upload_asset"];

/** "Their space", when they teach in one: upload_document and upload_asset may leave it out. */
async function withOnlySpace(db: Database, caller: Caller, tool: Tool, input: unknown) {
  const given = input as { space_id?: string };
  if (!SPACE_OPTIONAL.includes(tool.name) || given.space_id) {
    return input;
  }
  const spaces = await transactionAs(db, caller.userId, (tx) =>
    runAction(ACTIONS, "space.list", {}, ctxFor(tx, caller)),
  );
  const mine = spaces.ok ? (spaces.output as { id: string }[]) : [];
  return mine.length === 1 ? { ...given, space_id: mine[0]?.id } : null;
}

/** Where the answer points: the draft's preview, the route's public page, or the asset. */
async function urlOf(env: Env, tx: Transaction, caller: Caller, action: string, output: unknown) {
  if (action === "asset.upload") {
    return `${env.CONTENT_ORIGIN}/${(output as { key: string }).key}`;
  }
  if (PREVIEWED.includes(action)) {
    return previewOf(env, output);
  }
  if (action !== "route.publish") {
    return null;
  }
  const { routeId, spaceId } = output as { routeId: string; spaceId: string };
  return publicUrl(env, tx, caller, routeId, spaceId);
}

/** An asset from an address is taken before the transaction: no outside call runs inside one. */
async function withAsset(input: unknown) {
  const { source_url: address } = input as { source_url?: string };
  if (!address) {
    return { input };
  }
  const taken = await fetchAsset(address);
  return taken.ok
    ? { input: { ...(input as object), fetched: taken.bytes } }
    : { refusal: failed(`Nothing was stored: ${taken.why}.`) };
}

/** The committed action's files, in R2; a refusal to give when they did not save. */
async function filesStored(env: Env, tool: Tool, action: string, input: unknown, output: unknown) {
  try {
    await storeAfterCommit(env, action, input, output);
    return null;
  } catch (error) {
    console.error(
      JSON.stringify({ message: "storing a file failed", tool: tool.name, error: String(error) }),
    );
    return failed(
      action === "route.publish"
        ? "The route was published, but one of its interactive creations could not be put online, so it will not open for students yet. Tell the person, and upload that creation again before the next publish."
        : "Nothing is lost, but the file did not save. Send the same file again: nothing will be doubled.",
    );
  }
}

async function callTool(env: Env, db: Database, caller: Caller, tool: Tool, given: unknown) {
  const spaced = await withOnlySpace(db, caller, tool, given);
  if (spaced === null) {
    return failed("You teach in more than one space, or none: call list_spaces and give space_id.");
  }
  if (!caller.scopes.has(tool.scope)) {
    return failed(`This connection does not include ${tool.scope}.`);
  }
  if (tool.action === null) {
    const structuredContent = tool.answers?.() ?? {};
    return {
      structuredContent,
      content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
    };
  }
  const { action } = tool;
  if (tool.scope !== "routes:read" && !(await hasRoomToWrite(db, caller, tool, spaced))) {
    return failed("Too many changes for now. Wait a minute and try again.");
  }
  const { input, refusal } = await withAsset(spaced);
  if (refusal) {
    return refusal;
  }
  const actionInput = tool.toAction(input);
  const { result, url } = await transactionAs(db, caller.userId, async (tx) => {
    const answered = await runAction(ACTIONS, action, actionInput, ctxFor(tx, caller));
    return {
      result: answered,
      url: answered.ok ? await urlOf(env, tx, caller, action, answered.output) : null,
    };
  });
  if (!result.ok) {
    const routeId = (input as { route_id?: string }).route_id;
    return failed(
      result.code === "conflict" && routeId && "draft_revision" in (input as object)
        ? await staleText(db, caller, routeId)
        : refusalText(result),
    );
  }
  const notStored = await filesStored(env, tool, action, actionInput, result.output);
  if (notStored) {
    return notStored;
  }
  await queuePurge(env, purgeTagsAfter(action, result.output));
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
