// pnpm smoke:new-creator (Platform STEP 7): one new creator, the whole way, on production, with
// throwaway inboxes and no real person: apply, get invited, sign in, land on /creador, connect an
// MCP client, import a route, publish it, open it as a visitor, start it free.
//
// It writes to production, so it never runs by itself: run it by hand. It needs the migrator's URL
// from the Keychain, for three things no outside caller can do: file the application (Turnstile
// stops a script, on purpose), make the test operator, and clean up. Spaces are never deleted, so
// each run leaves an empty smoke-* space; its route is archived and its operator role removed.
import { execFileSync } from "node:child_process";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import pg from "pg";

const APP = process.env.SMOKE_APP ?? "https://app.learningroutes.com";
const MAIL = "https://api.mail.tm";
// The client's identity is a public document. A Worker can't fetch its own zone, so this repository's
// copy on jsDelivr, which serves it as JSON.
const CLIENT_HOME = "https://cdn.jsdelivr.net/gh/Learning-Routes/Learning-routes@main/scripts";
const CLIENT_ID = `${CLIENT_HOME}/smoke-client.json`;
const REDIRECT_URI = `${CLIENT_HOME}/smoke-client-callback`;
const SCOPES = "routes:read routes:write routes:publish";
const VERIFIER = "smoke-verifier-long-enough-for-the-forty-three-characters-it-needs";
const POLLS = 40;
const POLL_MS = 3000;
const TOKEN = /[#&]token=([A-Za-z0-9_-]+)/;
const FIRST_JSON = /```json\n([\s\S]*?)```/;
const SESSION = /(__Host-lr_session[^=]*=[^;]+)/;

let step = "";
function say(name: string) {
  step = name;
  console.log(`...  ${name}`);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A throwaway inbox: a random address, nobody's. */
async function newInbox() {
  const domains = (await (await fetch(`${MAIL}/domains`)).json()) as {
    "hydra:member": { domain: string }[];
  };
  const domain = domains["hydra:member"][0]?.domain;
  const address = `lr-smoke-${crypto.randomUUID().slice(0, 12)}@${domain}`;
  const password = crypto.randomUUID();
  const body = JSON.stringify({ address, password });
  const headers = { "content-type": "application/json" };
  await fetch(`${MAIL}/accounts`, { method: "POST", headers, body });
  const { token } = (await (
    await fetch(`${MAIL}/token`, { method: "POST", headers, body })
  ).json()) as { token: string };
  const auth = { authorization: `Bearer ${token}` };
  return {
    address,
    /** The link's token from the newest email with this subject word. */
    async linkToken(word: string) {
      for (let poll = 0; poll < POLLS; poll++) {
        const list = (await (await fetch(`${MAIL}/messages`, { headers: auth })).json()) as {
          "hydra:member": { id: string; subject: string }[];
        };
        const found = list["hydra:member"].find((message) => message.subject.includes(word));
        if (found) {
          const message = (await (
            await fetch(`${MAIL}/messages/${found.id}`, { headers: auth })
          ).json()) as { text: string };
          const token = TOKEN.exec(message.text)?.[1];
          if (token) {
            return token;
          }
        }
        await wait(POLL_MS);
      }
      throw new Error(`no email with "${word}" arrived`);
    },
  };
}

const post = (path: string, body: unknown, cookie = "") =>
  fetch(`${APP}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "accept-language": "es",
      "content-type": "application/json",
      origin: APP,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });

const sessionOf = (response: Response) => {
  for (const cookie of response.headers.getSetCookie()) {
    const found = SESSION.exec(cookie)?.[1];
    if (found) {
      return found;
    }
  }
  throw new Error(`no session cookie (status ${response.status})`);
};

async function signIn(inbox: Awaited<ReturnType<typeof newInbox>>) {
  const asked = await post("/api/auth/sign-in/magic-link", { email: inbox.address });
  if (!asked.ok) {
    throw new Error(`asking for a sign-in link was refused (status ${asked.status})`);
  }
  const token = await inbox.linkToken("enlace");
  const confirmed = await fetch(`${APP}/api/auth/magic-link/confirm`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: APP },
    body: new URLSearchParams({ token }),
  });
  return sessionOf(confirmed);
}

async function challengeOf(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(digest).toString("base64url");
}

/** The whole OAuth way, as a public client with PKCE: what an assistant's sign-in does. */
async function mcpToken(cookie: string) {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state: crypto.randomUUID(),
    code_challenge: await challengeOf(VERIFIER),
    code_challenge_method: "S256",
    resource: `${APP}/mcp`,
  });
  const asked = await fetch(`${APP}/api/auth/oauth2/authorize?${query}`, {
    redirect: "manual",
    headers: { cookie },
  });
  // A redirect, or the same address in JSON, which is how it answers a script.
  const location =
    asked.headers.get("location") ??
    ((await asked.json().catch(() => null)) as { url?: string } | null)?.url ??
    "";
  const page = new URL(location, APP);
  if (!page.searchParams.get("client_id")) {
    throw new Error(`authorize went to ${page.pathname} (status ${asked.status})`);
  }
  const consent = await post(
    "/api/auth/oauth2/consent",
    { accept: true, oauth_query: page.search.slice(1) },
    cookie,
  );
  const { url, error } = (await consent.json()) as { url?: string; error?: string };
  if (!url) {
    throw new Error(`consent was refused (status ${consent.status}): ${error}`);
  }
  const code = new URL(url).searchParams.get("code") ?? "";
  const answer = await fetch(`${APP}/api/auth/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_verifier: VERIFIER,
      resource: `${APP}/mcp`,
    }),
  });
  const tokens = (await answer.json()) as { access_token?: string };
  if (!tokens.access_token) {
    throw new Error(`no token (status ${answer.status})`);
  }
  return tokens.access_token;
}

async function assistantMakesARoute(token: string, slug: string) {
  const client = new Client({ name: "lr-smoke", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${APP}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  );
  const { tools } = await client.listTools();
  console.log(`     ${tools.length} tools`);
  const { spaces } = (await client.callTool({ name: "list_spaces", arguments: {} }))
    .structuredContent as { spaces: { space_id: string; slug: string }[] };
  const spaceId = spaces.find((space) => space.slug === slug)?.space_id;
  const { guide } = (await client.callTool({ name: "get_route_format", arguments: {} }))
    .structuredContent as { guide: string };
  const document = JSON.parse(FIRST_JSON.exec(guide)?.[1] ?? "null");
  const imported = await client.callTool({
    name: "import_route",
    arguments: { space_id: spaceId, document },
  });
  if (imported.isError) {
    throw new Error("import_route refused the guide's own example");
  }
  const made = imported.structuredContent as { route_id: string; draft_revision: number };
  const published = await client.callTool({
    name: "publish_route",
    arguments: { route_id: made.route_id, draft_revision: made.draft_revision },
  });
  await client.close();
  const { public_url: url } = published.structuredContent as { public_url: string };
  return { routeId: made.route_id, url, title: document.title.es as string };
}

type Inbox = Awaited<ReturnType<typeof newInbox>>;
type Leftovers = { routeId?: string; operator?: string };

async function makeOperator(db: pg.Client, inbox: Inbox, leftovers: Leftovers) {
  say("the operator signs in");
  const cookie = await signIn(inbox);
  const { rows } = await db.query(`select id from "user" where email = $1`, [inbox.address]);
  leftovers.operator = rows[0].id;
  await db.query("insert into platform_roles (user_id, is_operator) values ($1, true)", [
    leftovers.operator,
  ]);
  return cookie;
}

async function applyAndGetInvited(db: pg.Client, inbox: Inbox, operator: string) {
  say("a new creator applies");
  const applied = await db.query(
    `insert into creator_applications (name, email, teaches, locale)
     values ($1, $2, 'Una prueba del camino', 'es') returning id`,
    ["Prueba Smoke", inbox.address],
  );
  say("the operator invites them, and the email arrives");
  const sent = await post("/api/invitations/send", { applicationId: applied.rows[0].id }, operator);
  if (!sent.ok) {
    throw new Error(`the invitation was refused (status ${sent.status})`);
  }
  return inbox.linkToken("invitación");
}

async function acceptAndLand(token: string, slug: string) {
  say("they open the link and confirm their address");
  const accepted = await post("/api/invitations/accept", { token, slug });
  if (!accepted.ok) {
    throw new Error(`accepting was refused (status ${accepted.status})`);
  }
  const creator = sessionOf(accepted);
  say("they land on /creador");
  const hub = await fetch(`${APP}/creador`, { headers: { cookie: creator } });
  const page = await hub.text();
  if (!(hub.ok && page.includes("site-header") && page.includes(slug))) {
    throw new Error(`/creador answered ${hub.status} without their space`);
  }
  say("the link is spent");
  const again = await post("/api/invitations/accept", { token, slug: `${slug}-x` });
  if (again.status !== 410) {
    throw new Error(`a used link answered ${again.status}`);
  }
  return creator;
}

async function visitAndStart(made: { routeId: string; url: string; title: string }, who: string) {
  say("a visitor opens it");
  const visit = await fetch(made.url);
  if (!(visit.ok && (await visit.text()).includes(made.title))) {
    throw new Error(`the public page answered ${visit.status} without its title`);
  }
  say("someone starts it free");
  const started = await post("/api/a/enrollment.create", { routeId: made.routeId }, who);
  if (!started.ok) {
    throw new Error(`starting was refused (status ${started.status})`);
  }
  const mine = await fetch(`${APP}/mis-rutas`, { headers: { cookie: who } });
  if (!(mine.ok && (await mine.text()).includes(made.title))) {
    throw new Error("the route is not on Mis rutas");
  }
}

async function run(db: pg.Client) {
  const operatorInbox = await newInbox();
  const creatorInbox = await newInbox();
  const slug = `smoke-${crypto.randomUUID().slice(0, 8)}`;
  const leftovers: Leftovers = {};
  try {
    const operator = await makeOperator(db, operatorInbox, leftovers);
    const token = await applyAndGetInvited(db, creatorInbox, operator);
    const creator = await acceptAndLand(token, slug);
    say("they connect an MCP client, import a route, and publish it");
    const made = await assistantMakesARoute(await mcpToken(creator), slug);
    leftovers.routeId = made.routeId;
    await visitAndStart(made, operator);
  } finally {
    if (leftovers.routeId) {
      await db.query("update routes set archived_at = now() where id = $1", [leftovers.routeId]);
    }
    if (leftovers.operator) {
      await db.query("delete from platform_roles where user_id = $1", [leftovers.operator]);
    }
  }
}

const url =
  process.env.DATABASE_URL_MIGRATOR ??
  execFileSync("security", ["find-generic-password", "-s", "lr-migrator", "-w"], {
    encoding: "utf8",
  }).trim();
const db = new pg.Client({ connectionString: url });
await db.connect();
try {
  await run(db);
  console.log("all of the new creator's way passed");
} catch (error) {
  console.error(`FAIL at "${step}": ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
