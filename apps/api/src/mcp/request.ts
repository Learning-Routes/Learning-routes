import { createMcpHandler } from "@modelcontextprotocol/server";
import { createLocalJWKSet, type JWTPayload, jwtVerify } from "jose";
import { AUTH_PATH } from "../auth/shared";
import { consentedAt, noteUse } from "../db/repos/connections";
import type { Database } from "../db/with-db";
import { logEvent } from "../log";
import type { createOAuth } from "./auth";
import { readAtMost } from "./read-at-most";
import { type Caller, createServer } from "./server";
import { scopeOfTool } from "./tools";

// One request to /mcp (Platform STEP 5 §3): what every call passes before any tool. The MCP
// SDK answers the protocol; it never reads a token, so all of that is here.

// A 2 MB creation, escaped as JSON, with room to spare (Platform STEP 9 §2).
const MOST_BYTES = 4 * 1_048_576;
const DEEPEST = 32;
// offline_access too: a client that asks only for what this names, as ChatGPT does, can then refresh.
const ALL_SCOPES = "offline_access routes:read routes:write routes:publish";
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

const refusal = (status: number, code: number, message: string, headers?: HeadersInit) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

/** A browser page elsewhere has no business here; a client outside a browser sends no Origin. */
function isForeignOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("origin");
  if (origin === null || origin === env.APP_ORIGIN) {
    return false;
  }
  return !(String(env.ENVIRONMENT) === "development" && LOOPBACK.test(origin));
}

function challenges(env: Env) {
  const metadata = `${env.APP_ORIGIN}/.well-known/oauth-protected-resource/mcp`;
  return {
    unauthorized: `Bearer resource_metadata="${metadata}", scope="${ALL_SCOPES}"`,
    insufficient: (scope: string) =>
      `Bearer error="insufficient_scope", scope="${scope}", resource_metadata="${metadata}", error_description="This call needs ${scope}."`,
  };
}

/** The token's claims, if it is this issuer's, for this server, in time, and not disconnected. */
async function verified(
  request: Request,
  env: Env,
  db: Database,
  oauth: ReturnType<typeof createOAuth>,
): Promise<JWTPayload | null> {
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  try {
    const { payload } = await jwtVerify(
      token,
      createLocalJWKSet((await oauth.api.getJwks()) as Parameters<typeof createLocalJWKSet>[0]),
      {
        issuer: `${env.APP_ORIGIN}${AUTH_PATH}`,
        audience: `${env.APP_ORIGIN}/mcp`,
        requiredClaims: ["sub", "azp", "iat", "exp"],
      },
    );
    // shortcut(Platform STEP 7): a sender-bound (DPoP) token is refused, since no client we want uses
    // one; verify the proof with verifyAccessTokenRequest if one ever does.
    if (payload.cnf) {
      return null;
    }
    // A JWT can't be revoked: its consent is what "Desconectar" takes away. One newer than
    // the token means they disconnected and connected again, which the old token outlives.
    const consent = await consentedAt(db, String(payload.sub), String(payload.azp));
    const issuedMs = Number(payload.iat) * 1000;
    return consent !== null && issuedMs >= Math.floor(consent.getTime() / 1000) * 1000
      ? payload
      : null;
  } catch {
    return null;
  }
}

/** Where the JSON string opening at this quote ends. */
function afterString(text: string, opening: number): number {
  let at = opening + 1;
  while (at < text.length && text[at] !== '"') {
    at += text[at] === "\\" ? 2 : 1;
  }
  return at;
}

/** How deep a JSON text nests, read without parsing it: JSON.parse must never see a bomb. */
export function depthOf(text: string): number {
  let depth = 0;
  let deepest = 0;
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (char === '"') {
      at = afterString(text, at);
    } else if (char === "{" || char === "[") {
      depth++;
      deepest = Math.max(deepest, depth);
    } else if (char === "}" || char === "]") {
      depth--;
    }
  }
  return deepest;
}

/** The scope this JSON-RPC message needs, read from the message itself. */
function scopeNeeded(message: { method?: unknown; params?: { name?: unknown } }): string | null {
  if (message.method === "tools/call") {
    return scopeOfTool(message.params?.name);
  }
  return message.method === "resources/read" ? "routes:read" : null;
}

async function bodyOf(request: Request): Promise<string | Response> {
  if (Number(request.headers.get("content-length") ?? 0) > MOST_BYTES) {
    return refusal(413, -32600, "This request is over 1 MB.");
  }
  const bytes = await readAtMost(request, MOST_BYTES);
  if (bytes === null) {
    return refusal(413, -32600, "This request is over 1 MB.");
  }
  const text = new TextDecoder().decode(bytes);
  return depthOf(text) > DEEPEST ? refusal(400, -32600, "This request nests too deeply.") : text;
}

/** The POST to hand on, re-readable, or the refusal: too large, not JSON, or out of scope. */
async function checkedPost(
  request: Request,
  scopeRefusal: (needed: string) => Response | null,
): Promise<Request | Response> {
  const text = await bodyOf(request);
  if (text instanceof Response) {
    return text;
  }
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    return refusal(400, -32700, "This request is not JSON.");
  }
  if (Array.isArray(message)) {
    return refusal(400, -32600, "Batches are not supported.");
  }
  // The one kind of answer that never ends, and this server changes nothing to listen for.
  if ((message as { method?: unknown } | null)?.method === "subscriptions/listen") {
    return refusal(404, -32601, "This server has no subscriptions.");
  }
  const needed = scopeNeeded((message ?? {}) as Parameters<typeof scopeNeeded>[0]);
  return (
    (needed === null ? null : scopeRefusal(needed)) ??
    new Request(request.url, { method: "POST", headers: request.headers, body: text })
  );
}

const TOOL_NAME = /"name":"([a-z_]+)","(?:title|description)"/g;

type CallAsked = { method?: string; params?: { name?: unknown; arguments?: object } } | null;

/** What was asked and answered, by name only: no token, and no argument's value. */
function logCall(
  request: Request,
  asked: CallAsked,
  caller: Caller,
  status: number,
  body: ArrayBuffer,
) {
  // The names only. An older client's answer comes framed as an event, after "data: ".
  const tools =
    asked?.method === "tools/list"
      ? [...new TextDecoder().decode(body).matchAll(TOOL_NAME)].map((match) => match[1] ?? "")
      : undefined;
  logEvent({
    message: "mcp call",
    status,
    client_id: caller.clientId,
    protocol: request.headers.get("mcp-protocol-version"),
    scopes: [...caller.scopes],
    ...(asked?.method ? { rpc: asked.method } : { method: request.method }),
    ...(asked?.method === "tools/call"
      ? { tool: String(asked.params?.name), arg_keys: Object.keys(asked.params?.arguments ?? {}) }
      : {}),
    ...(tools ? { tools } : {}),
  });
}

export async function serveMcp(
  request: Request,
  env: Env,
  db: Database,
  oauth: ReturnType<typeof createOAuth>,
): Promise<Response> {
  if (isForeignOrigin(request, env)) {
    return refusal(403, -32600, "This origin may not call this server.");
  }
  const { unauthorized, insufficient } = challenges(env);
  const claims = await verified(request, env, db, oauth);
  if (claims === null) {
    return refusal(401, -32001, "A valid access token is needed.", {
      "www-authenticate": unauthorized,
    });
  }
  const scopes = new Set(String(claims.scope ?? "").split(" "));
  const caller: Caller = {
    userId: String(claims.sub),
    clientId: String(claims.azp),
    scopes,
    adapter: (await oauth.$context).adapter,
  };
  await noteUse(db, caller.userId, caller.clientId, new Date());

  const forward =
    request.method === "POST"
      ? await checkedPost(request, (needed) =>
          scopes.has(needed)
            ? null
            : refusal(403, -32003, `This call needs ${needed}.`, {
                "www-authenticate": insufficient(needed),
              }),
        )
      : request;
  if (forward instanceof Response) {
    return forward;
  }
  const asked = (request.method === "POST" ? await forward.clone().json() : null) as CallAsked;
  const handler = createMcpHandler(() => createServer(env, db, caller), { responseMode: "json" });
  const answer = await handler.fetch(forward);
  // The handler answers before its tool has finished, with the body still to come. Read it
  // here: the database connection closes when this function returns.
  const body = await answer.arrayBuffer();
  logCall(forward, asked, caller, answer.status, body);
  return new Response(body, answer);
}
