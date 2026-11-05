import { BRAND } from "@learning-routes/core/locales";
import { pageContext } from "../context";
import type { Route } from "./+types/smoke-client";

// The client document the new-creator smoke test connects with. A client's identity is a public
// address; this one's only redirect is back to this host, which answers nothing.
export function loader({ context }: Route.LoaderArgs) {
  const { appOrigin } = context.get(pageContext);
  return Response.json({
    client_id: `${appOrigin}/smoke-client.json`,
    client_name: `${BRAND} smoke test`,
    client_uri: appOrigin,
    redirect_uris: [`${appOrigin}/smoke-client-callback`],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
  });
}
