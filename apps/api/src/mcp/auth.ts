import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { oauthPlugins } from "../auth/oauth-options";
import { sharedAuthOptions } from "../auth/shared";
import { connectionsRepo } from "../db/repos/connections";
import * as sessionTables from "../db/schema/auth";
import * as oauthTables from "../db/schema/oauth";
import { type Database, transactionAs } from "../db/with-db";

// The OAuth provider for one request (Platform STEP 5 §2), in the MCP Worker: too large for
// the API's budget, so this Worker holds it and the API keeps signing people in. Both read
// the same sessions, with the same secret.

export function createOAuth(
  env: Env,
  db: Database,
  fetchClientMetadataResource: ClientMetadataResourceFetch,
) {
  return betterAuth({
    ...sharedAuthOptions(env),
    disabledPaths: ["/token"],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { ...sessionTables, ...oauthTables },
    }),
    plugins: oauthPlugins({
      resource: `${env.APP_ORIGIN}/mcp`,
      fetchClientMetadataResource,
      // Every token, refreshed ones too: whoever no longer teaches anywhere gets none.
      customAccessTokenClaims: async ({ user }) => {
        const userId = user?.id;
        const allowed =
          userId !== undefined &&
          (await transactionAs(db, userId, (tx) => connectionsRepo(tx).canConnect(userId)));
        if (!allowed) {
          throw new APIError("FORBIDDEN", { error: "access_denied" });
        }
        return {};
      },
    }),
  });
}
