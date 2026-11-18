import { getAgentByName } from "agents";
import { withClient } from "../db/with-db";
import { readSessions } from "./auth";
import { doorFor } from "./door";
import { entryFor, fromMcp } from "./entries";
import { creatorRequired, entryOf } from "./entry";
import { type AgentEnv, USER_HEADER } from "./env";

// The assistant's Worker (Platform STEP 10 §1). The web Worker hands it the page's WebSocket at
// STUDIO_PATH (door.ts); nothing else reaches the objects. Before a connection is passed on, this checks it
// comes from the app, with a live session, from an editor of the space it asks for. The object
// trusts the user header only because this Worker set it.

// biome-ignore lint/performance/noBarrelFile: a Worker exports its Durable Object classes from its main module.
export { SpendLedger } from "./ledger";
export { Studio } from "./studio";

import type { Studio } from "./studio";

const refuse = (status: number) => new Response(null, { status });

export default {
  async fetch(request, env, ctx) {
    // The tutor, route images, and the MCP's generate_image (Platform STEP 20): entries.ts.
    const entry = entryFor(request, env, ctx) ?? fromMcp(request, env, ctx);
    if (entry) {
      return entry;
    }
    const door = doorFor(request, env.APP_ORIGIN);
    if (door instanceof Response) {
      return door;
    }
    const { spaceId } = door;
    const seen = await withClient(env, ctx, async (db) => {
      const session = await readSessions(env, db).api.getSession({ headers: request.headers });
      return session
        ? { userId: session.user.id, entry: await entryOf(db, session.user.id, spaceId) }
        : null;
    });
    if (seen === null) {
      return refuse(401);
    }
    if (seen.entry === "creator_required") {
      return creatorRequired(request);
    }
    if (seen.entry === "not_found") {
      return refuse(404);
    }
    const { userId } = seen;
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
