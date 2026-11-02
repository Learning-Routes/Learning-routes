import type { z } from "zod";
import type { ActionDef, ActionResult } from "./define";
import { blockAdd, lessonAdd, moduleAdd } from "./drafting";
import { enrollmentCreate, enrollmentUpgrade } from "./enrollments";
import type { ActionName } from "./names";
import { reviewSubmit } from "./review";
import { routeCreate, routeGet, routeList, routePublish } from "./routes";
import { membershipAdd, spaceGet } from "./spaces";

// Every action the platform has. `satisfies` holds it to ACTION_NAMES: a name
// missing here, or an action not named there, does not compile.
export const ACTIONS = {
  "space.get": spaceGet,
  "membership.add": membershipAdd,
  "route.create": routeCreate,
  "route.get": routeGet,
  "route.list": routeList,
  "module.add": moduleAdd,
  "lesson.add": lessonAdd,
  "block.add": blockAdd,
  "route.publish": routePublish,
  "enrollment.create": enrollmentCreate,
  "enrollment.upgrade": enrollmentUpgrade,
  "review.submit": reviewSubmit,
} as const satisfies Record<ActionName, ActionDef>;

type Actions = typeof ACTIONS;
export type ActionInput<N extends ActionName> = z.input<Actions[N]["input"]>;
export type ActionOutput<N extends ActionName> = Awaited<ReturnType<Actions[N]["run"]>>;
export type ActionResponse<N extends ActionName> = ActionResult<ActionOutput<N>>;
