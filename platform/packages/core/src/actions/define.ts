import { z } from "zod";
import { can } from "../access";
import type { SpaceRole } from "../domain";
import type { Actor, ActorKind } from "./actor";

// The action registry: every change to the platform is one action. The internal
// endpoint, public REST, MCP and the typed client all come from it, so a button and
// an agent can only ever do the same things. Pure: the caller supplies the store,
// the time and the id maker.

/** What an action may read and write. The API implements it on real storage. */
export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

/** The row an action acts on; its space is the space the action runs in. */
export interface Target {
  kind: "space" | "route" | "enrollment";
  id: string;
}

/**
 * Where a row lives and who may act there (Platform STEP 2 §3.2). The API reads
 * both from Postgres, under the acting user's row-level security.
 */
export interface Tenancy {
  /** The row's space, or null when the actor cannot see the row. */
  spaceOf(target: Target): Promise<string | null>;
  /** The user's role in the space, or null when they are not a member. */
  roleOf(spaceId: string, userId: string): Promise<SpaceRole | null>;
}

/** The space an action runs in, and the actor's role there, found by runAction. */
export interface Scope {
  spaceId: string;
  role: SpaceRole;
}

export interface Ctx {
  actor: Actor;
  store: Store;
  tenancy: Tenancy;
  /** Epoch milliseconds. */
  now: number;
  newId: () => string;
}

export interface ActionDef<I extends z.ZodType = z.ZodType, O = unknown> {
  name: string;
  kind: "query" | "mutation";
  description: string;
  input: I;
  /** The row the action acts on. A spaceId in the input is checked against its space. */
  target: (input: z.infer<I>) => Target;
  run: (ctx: Ctx, input: z.infer<I>, scope: Scope) => Promise<O>;
}

export type Registry = Record<string, ActionDef>;

/** A refusal an action raises on purpose; runAction reports it as a result. */
export class ActionError extends Error {
  override name = "ActionError";
  constructor(
    readonly code: "not_found" | "forbidden" | "invalid",
    message: string,
  ) {
    super(message);
  }
}

export type ActionResult<O = unknown> =
  | { ok: true; output: O }
  | { ok: false; code: "unknown_action" }
  | { ok: false; code: "invalid_input"; issues: { path: string; message: string }[] }
  | { ok: false; code: ActionError["code"]; message: string };

/** New: keeps an action's input and output types while it is declared. */
export function defineAction<I extends z.ZodType, O>(action: ActionDef<I, O>): ActionDef<I, O> {
  return action;
}

const NOT_FOUND = { ok: false, code: "not_found", message: "not found" } as const;

/**
 * New: the one gate every caller goes through. It validates the input, finds the
 * target row's space and the actor's role there, checks the permission table, runs
 * the action and reports the result; the refusals are the same for every actor.
 * Outside the space, or for a row the actor cannot see, the answer is not_found;
 * forbidden is only for a member whose role or way in is not allowed.
 */
export async function runAction(
  registry: Registry,
  name: string,
  rawInput: unknown,
  ctx: Ctx,
  isAllowed: (role: SpaceRole, action: string, via: ActorKind) => boolean = can,
): Promise<ActionResult> {
  const action = Object.hasOwn(registry, name) ? registry[name] : undefined;
  if (!action) {
    return { ok: false, code: "unknown_action" };
  }
  const parsed = action.input.safeParse(rawInput);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return { ok: false, code: "invalid_input", issues };
  }
  // The space comes from the row, never from the input.
  const spaceId = await ctx.tenancy.spaceOf(action.target(parsed.data));
  const claimed = (parsed.data as { spaceId?: unknown }).spaceId;
  const role = spaceId === null ? null : await ctx.tenancy.roleOf(spaceId, ctx.actor.userId);
  if (spaceId === null || role === null || (claimed !== undefined && claimed !== spaceId)) {
    return NOT_FOUND;
  }
  if (!isAllowed(role, name, ctx.actor.via)) {
    return { ok: false, code: "forbidden", message: "not allowed" };
  }
  try {
    return { ok: true, output: await action.run(ctx, parsed.data, { spaceId, role }) };
  } catch (error) {
    if (!(error instanceof ActionError)) {
      throw error;
    }
    return { ok: false, code: error.code, message: error.message };
  }
}

/**
 * New: the MCP tool descriptors, generated from the same registry. Each tool is
 * named by its registry key, the name runAction answers to.
 */
export function mcpTools(registry: Registry) {
  return Object.entries(registry).map(([name, action]) => ({
    name,
    description: action.description,
    inputSchema: z.toJSONSchema(action.input, { io: "input" }),
    annotations: { readOnlyHint: action.kind === "query" },
  }));
}
