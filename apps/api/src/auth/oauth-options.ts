import { cimd } from "@better-auth/cimd";
import { mcp } from "@better-auth/mcp";
import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import { jwt } from "better-auth/plugins/jwt";

// The OAuth 2.1 provider MCP clients sign in through (Platform STEP 5 §2). The plugins that
// shape its tables are here, so `pnpm db:auth-schema` and the Worker never disagree.

/** What a token may do, in the words of the consent screen. */
const MCP_SCOPES = ["routes:read", "routes:write", "routes:publish"] as const;

const AN_HOUR_S = 3600;

export function oauthPlugins(input: {
  resource: string;
  fetchClientMetadataResource: ClientMetadataResourceFetch;
  customAccessTokenClaims?: Parameters<typeof mcp>[0]["customAccessTokenClaims"];
}) {
  return [
    // No session cookie becomes a JWT: only the OAuth provider signs tokens.
    jwt({ disableSettingJwtHeader: true }),
    mcp({
      resource: input.resource,
      loginPage: "/sign-in",
      consentPage: "/conectar",
      scopes: ["offline_access", ...MCP_SCOPES],
      accessTokenExpiresIn: AN_HOUR_S,
      // A refresh token used twice revokes the whole chain, with no grace window.
      refreshTokenReuseInterval: 0,
      ...(input.customAccessTokenClaims
        ? { customAccessTokenClaims: input.customAccessTokenClaims }
        : {}),
    }),
    cimd({
      fetchClientMetadataResource: input.fetchClientMetadataResource,
      metadataProfile: "mcp-2026-07-28",
    }),
  ];
}
