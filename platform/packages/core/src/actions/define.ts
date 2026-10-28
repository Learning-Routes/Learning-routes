import { z } from "zod";

// The action registry: every change to the platform is one action. The internal
// endpoint, public REST, MCP and the typed client all come from it, so a button and
// an agent can only ever do the same things. Pure: the caller supplies the store,
// the time and the id maker.

export type ActorKind = "ui" | "mcp" | "agent";
export interface Actor {
  via: ActorKind;
  userId: string;
}

/** What an action may read and write. The API implements it on real storage. */
export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

export interface Ctx {
  actor: Actor;
  store: Store;
  /** Epoch milliseconds. */
  now: number;
  newId: () => string;
}

export interface ActionDef<I extends z.ZodType = z.ZodType, O = unknown> {
  name: string;
  kind: "query" | "mutation";
  description: string;
  input: I;
  run: (ctx: Ctx, input: z.infer<I>) => Promise<O>;
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

/**
 * New: the one gate every caller goes through. It validates the input, runs the
 * action and reports the result; the refusals are the same for every actor.
 */
export async function runAction(
  registry: Registry,
  name: string,
  rawInput: unknown,
  ctx: Ctx,
): Promise<ActionResult> {
  const action = Object.hasOwn(registry, name) ? registry[name] : undefined;
  if (!action) return { ok: false, code: "unknown_action" };
  const parsed = action.input.safeParse(rawInput);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return { ok: false, code: "invalid_input", issues };
  }
  try {
    return { ok: true, output: await action.run(ctx, parsed.data) };
  } catch (error) {
    if (!(error instanceof ActionError)) throw error;
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
