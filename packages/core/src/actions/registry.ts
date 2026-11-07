import type { z } from "zod";
import {
  adminOverview,
  applicationDecide,
  applicationInvite,
  catalogDecide,
  catalogFeature,
  catalogRequest,
  catalogWithdraw,
  invitationAccept,
} from "./catalog";
import { connectionGrant, connectionList, connectionRevoke } from "./connections";
import type { ActionDef, ActionResult } from "./define";
import { blockAdd, blockAddMany, blockRemove, lessonAdd, moduleAdd } from "./drafting";
import { enrollmentCreate, enrollmentList, enrollmentUpgrade, lessonRead } from "./enrollments";
import { routeImport, routePreview, routeUpload } from "./imports";
import type { ActionName } from "./names";
import { reviewSubmit } from "./review";
import {
  routeCreate,
  routeGet,
  routeList,
  routePublish,
  routeSetPrice,
  routeUpdate,
} from "./routes";
import { membershipAdd, spaceCreate, spaceGet, spaceList, spaceUpdate } from "./spaces";
import { assetUpload, creationUpload } from "./uploads";

// Every action the platform has. `satisfies` holds it to ACTION_NAMES: a name
// missing here, or an action not named there, does not compile.
export const ACTIONS = {
  "space.get": spaceGet,
  "space.update": spaceUpdate,
  "space.create": spaceCreate,
  "space.list": spaceList,
  "membership.add": membershipAdd,
  "route.create": routeCreate,
  "route.get": routeGet,
  "route.list": routeList,
  "module.add": moduleAdd,
  "lesson.add": lessonAdd,
  "block.add": blockAdd,
  "blocks.add": blockAddMany,
  "block.remove": blockRemove,
  "route.update": routeUpdate,
  "route.set_price": routeSetPrice,
  "route.import": routeImport,
  "route.upload": routeUpload,
  "route.preview": routePreview,
  "route.publish": routePublish,
  "creation.upload": creationUpload,
  "asset.upload": assetUpload,
  "enrollment.create": enrollmentCreate,
  "enrollment.upgrade": enrollmentUpgrade,
  "review.submit": reviewSubmit,
  "catalog.request": catalogRequest,
  "catalog.withdraw": catalogWithdraw,
  "catalog.decide": catalogDecide,
  "catalog.feature": catalogFeature,
  "admin.overview": adminOverview,
  "application.decide": applicationDecide,
  "application.invite": applicationInvite,
  "invitation.accept": invitationAccept,
  "enrollment.list": enrollmentList,
  "lesson.read": lessonRead,
  "connection.list": connectionList,
  "connection.grant": connectionGrant,
  "connection.revoke": connectionRevoke,
} as const satisfies Record<ActionName, ActionDef>;

type Actions = typeof ACTIONS;
export type ActionInput<N extends ActionName> = z.input<Actions[N]["input"]>;
export type ActionOutput<N extends ActionName> = Awaited<ReturnType<Actions[N]["run"]>>;
export type ActionResponse<N extends ActionName> = ActionResult<ActionOutput<N>>;
