import { getAgentByName } from "agents";
import { pgTenancy } from "../db/tenancy";
import { transactionAs, withClient } from "../db/with-db";
import { readSessions } from "./auth";
import { doorFor } from "./door";
import { type AgentEnv, USER_HEADER } from "./env";

// The assistant's Worker (Platform STEP 10 §1). The web Worker hands it the page's WebSocket at
// STUDIO_PATH (door.ts); nothing else reaches the objects. Before a connection is passed on, this checks it
// comes from the app, with a live session, from an editor of the space it asks for. The object
// trusts the user header only because this Worker set it.

// biome-ignore lint/performance/noBarrelFile: a Worker exports its Durable Object classes from its main module.
export { SpendLedger } from "./ledger";
export { Studio } from "./studio";

import type { Studio } from "./studio";

const EDITORS: readonly string[] = ["owner", "coeditor"];

const refuse = (status: number) => new Response(null, { status });

export default {
  async fetch(request, env, ctx) {
    const door = doorFor(request, env.APP_ORIGIN);
    if (door instanceof Response) {
      return door;
    }
    const { spaceId } = door;
    const userId = await withClient(env, ctx, async (db) => {
      const session = await readSessions(env, db).api.getSession({ headers: request.headers });
      if (!session) {
        return null;
      }
      const id = session.user.id;
      const scope = await transactionAs(db, id, (tx) =>
        pgTenancy(tx).scopeOf({ kind: "space", id: spaceId }, id),
      );
      return EDITORS.includes(scope?.role ?? "") ? id : "";
    });
    if (userId === null) {
      return refuse(401);
    }
    if (!userId) {
      return refuse(404);
    }
    const headers = new Headers(request.headers);
    headers.delete("cookie");
    headers.set(USER_HEADER, userId);
    const studio = await getAgentByName(
      env.Studio as unknown as DurableObjectNamespace<Studio>,
      spaceId,
    );
    return studio.fetch(new Request(request, { headers }));
  },
} satisfies ExportedHandler<AgentEnv>;
