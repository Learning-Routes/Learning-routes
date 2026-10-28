import type { z } from "zod";
import type { ActionDef, ActionResult } from "./define";
import type { ActionName } from "./names";
import { reviewSubmit } from "./review";

// Every action the platform has. `satisfies` holds it to ACTION_NAMES: a name
// missing here, or an action not named there, does not compile.
export const ACTIONS = {
  "review.submit": reviewSubmit,
} as const satisfies Record<ActionName, ActionDef>;

type Actions = typeof ACTIONS;
export type ActionInput<N extends ActionName> = z.input<Actions[N]["input"]>;
export type ActionOutput<N extends ActionName> = Awaited<ReturnType<Actions[N]["run"]>>;
export type ActionResponse<N extends ActionName> = ActionResult<ActionOutput<N>>;
