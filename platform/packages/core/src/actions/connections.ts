import * as z from "zod";
import { ActionError, defineAction } from "./define";

// A person's connected assistants (Platform STEP 5 §2): connecting belongs to the account,
// not to a space, and happens only in the app. The grant itself is the OAuth provider's;
// these say whether it may happen, keep it in the log, and end it.

const ClientId = z.string().min(1).max(2048);
const SELF = { kind: "account", id: "self", self: true } as const;

export const connectionList = defineAction({
  name: "connection.list",
  kind: "query",
  description: "List the assistants connected to your account.",
  input: z.strictObject({}),
  target: () => SELF,
  run: (ctx) => ctx.repos.connections.list(ctx.actor.userId),
});

export const connectionGrant = defineAction({
  name: "connection.grant",
  kind: "mutation",
  description: "Say yes to an assistant connecting to your account, if you teach in a space.",
  input: z.strictObject({ clientId: ClientId, scopes: z.array(z.string().max(64)).max(16) }),
  target: () => SELF,
  run: async (ctx) => {
    if (!(await ctx.repos.connections.canConnect(ctx.actor.userId))) {
      throw new ActionError("forbidden", "connecting takes a space to teach in");
    }
    return { connected: true };
  },
});

export const connectionRevoke = defineAction({
  name: "connection.revoke",
  kind: "mutation",
  description: "Disconnect an assistant from your account, at once.",
  input: z.strictObject({ clientId: ClientId }),
  target: () => SELF,
  run: async (ctx, input) => {
    if (!(await ctx.repos.connections.revoke(ctx.actor.userId, input.clientId))) {
      throw new ActionError("not_found", "not found");
    }
    return { disconnected: true };
  },
});
