import { createMcpApp } from "../../src/mcp/app";
import { APP, harness, json, randomEmail, randomIp } from "../auth/harness";
import { TEST_SECRET, URLS } from "../db/connect";

// An MCP client and a person in a browser, against the MCP Worker's Hono app and the
// local database. The client's metadata document is served from here, not fetched.

export const RESOURCE = `${APP}/mcp`;
export const CLIENT_ID = "https://client.example.test/metadata.json";
export const REDIRECT_URI = "http://127.0.0.1/callback";
const VERIFIER = "a-code-verifier-long-enough-for-the-forty-three-character-minimum";

export const CLIENT_DOCUMENT = {
  client_id: CLIENT_ID,
  client_name: "Cliente de prueba",
  redirect_uris: ["http://localhost/callback", REDIRECT_URI],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
};

async function challengeOf(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

const FORM = { "content-type": "application/x-www-form-urlencoded" };

export function oauthHarness() {
  const api = harness();
  const pending: Promise<unknown>[] = [];
  const documents = new Map<string, unknown>([[CLIENT_ID, CLIENT_DOCUMENT]]);
  const app = createMcpApp({
    fetchClientMetadataResource: async (input) => {
      const found = documents.get(String(input));
      return found
        ? new Response(JSON.stringify(found), {
            headers: { "content-type": "application/json" },
          })
        : new Response(null, { status: 404 });
    },
  });
  const env = {
    DB: { connectionString: URLS.app } as Hyperdrive,
    APP_ORIGIN: APP,
    ENVIRONMENT: "test",
    BETTER_AUTH_SECRET: TEST_SECRET,
    CREATOR_DOMAIN: "example.test",
    PURGE_QUEUE: { send: async () => undefined },
  } as unknown as Env;
  const ctx = {
    waitUntil: (promise: Promise<unknown>) => void pending.push(promise),
    passThroughOnException: () => undefined,
    props: {},
  } as unknown as ExecutionContext;

  const call = (path: string, init: RequestInit & { cookie?: string; client?: true } = {}) => {
    const headers = new Headers(init.headers);
    headers.set("cf-connecting-ip", randomIp());
    if (init.cookie) {
      headers.set("cookie", init.cookie);
    }
    // A client is no browser: it sends no Origin.
    if (init.method && init.method !== "GET" && !init.client && !headers.has("origin")) {
      headers.set("origin", APP);
    }
    return app.request(`${APP}${path}`, { ...init, headers }, env, ctx);
  };

  /** Signs in through the API, as a browser does; the session cookie to send. */
  const signIn = async (email = randomEmail()) => {
    await api.call("/api/auth/sign-in/magic-link", json({ email }));
    const message = api.sent.find((entry) => entry.email === email);
    const token = new URLSearchParams(new URL(message?.url ?? "").hash.slice(1)).get("token");
    const confirmed = await api.call("/api/auth/magic-link/confirm", {
      method: "POST",
      headers: FORM,
      body: new URLSearchParams({ token: token ?? "" }).toString(),
    });
    const cookie = confirmed.headers
      .getSetCookie()
      .find((line) => line.startsWith("__Host-lr_session="));
    return { email, cookie: cookie?.split(";")[0] ?? "" };
  };

  const authorize = async (
    cookie: string,
    scope = "routes:read routes:write routes:publish offline_access",
    clientId = CLIENT_ID,
  ) => {
    const query = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      scope,
      state: "state-1",
      code_challenge: await challengeOf(VERIFIER),
      code_challenge_method: "S256",
      resource: RESOURCE,
    });
    return call(`/api/auth/oauth2/authorize?${query}`, { cookie });
  };

  const consent = (cookie: string, consentUrl: string, accept = true) =>
    call("/api/auth/oauth2/consent", {
      ...json({ accept, oauth_query: new URL(consentUrl, APP).search.slice(1) }),
      cookie,
    });

  const exchange = (code: string) =>
    call("/api/auth/oauth2/token", {
      method: "POST",
      client: true,
      headers: FORM,
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: VERIFIER,
        resource: RESOURCE,
      }).toString(),
    });

  const refresh = (token: string) =>
    call("/api/auth/oauth2/token", {
      method: "POST",
      client: true,
      headers: FORM,
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token,
        client_id: CLIENT_ID,
        resource: RESOURCE,
      }).toString(),
    });

  /** The whole way to tokens, for a person who may connect. */
  const connect = async (cookie: string, scope?: string) => {
    const asked = await authorize(cookie, scope);
    const answer = (await (await consent(cookie, asked.headers.get("location") ?? "")).json()) as {
      url: string;
    };
    const code = new URL(answer.url).searchParams.get("code") ?? "";
    const tokens = (await (await exchange(code)).json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string;
    };
    return tokens;
  };

  const settle = async () => {
    await api.settle();
    await Promise.allSettled(pending.splice(0));
  };
  /** A tool call through /mcp: its result, with the protocol's envelope. */
  const tool = async (token: string, name: string, args: Record<string, unknown> = {}) => {
    const response = await call("/mcp", envelope("tools/call", { name, arguments: args }, token));
    const body = (await response.json()) as {
      result?: {
        isError?: boolean;
        structuredContent?: Record<string, unknown>;
        content?: { text: string }[];
      };
    };
    return { status: response.status, ...body.result };
  };

  return {
    api,
    call,
    signIn,
    authorize,
    consent,
    exchange,
    refresh,
    connect,
    settle,
    documents,
    tool,
  };
}

export const PROTOCOL = "2026-07-28";

/** One JSON-RPC request of the 2026-07-28 revision, with what its headers must say. */
export function envelope(
  method: string,
  params: Record<string, unknown>,
  token?: string,
  headers: Record<string, string> = {},
) {
  const name = params.name ?? params.uri;
  return {
    method: "POST",
    client: true as const,
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL,
      "mcp-method": method,
      ...(typeof name === "string" ? { "mcp-name": name } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": PROTOCOL,
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  };
}
