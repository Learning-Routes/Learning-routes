#!/usr/bin/env node
// Read-only checks of the live hosts (Platform STEP 7 §7): every host answers, the headers are
// right, /mcp asks for a sign-in with the right metadata, the storefront is cached on the second
// request, and every link from every host's landing leads somewhere. It sends no credentials and
// changes nothing. Runs after every deploy.
import { crawl } from "./link-check.mjs";

const APEX = process.env.SMOKE_APEX ?? "https://learningroutes.com";
const APP = process.env.SMOKE_APP ?? "https://app.learningroutes.com";
const WWW = process.env.SMOKE_WWW ?? "https://www.learningroutes.com";
/** A creator's host, once one exists. */
const CREATOR = process.env.SMOKE_CREATOR;
const RESOURCE = `${APP}/mcp`;
const ISSUER = `${APP}/api/auth`;
const SECONDS_IN_A_DAY = "max-age=86400";

let failed = 0;
function check(name, passed, detail = "") {
  console.log(`${passed ? "ok  " : "FAIL"} ${name}${!passed && detail ? `: ${detail}` : ""}`);
  failed += passed ? 0 : 1;
}

const get = (url, init = {}) => fetch(url, { redirect: "manual", ...init });

function securityHeaders(name, response) {
  const { headers } = response;
  check(
    `${name}: HSTS for a day, no preload`,
    headers.get("strict-transport-security") === SECONDS_IN_A_DAY,
  );
  check(`${name}: X-Content-Type-Options`, headers.get("x-content-type-options") === "nosniff");
  check(`${name}: Referrer-Policy`, headers.has("referrer-policy"));
  check(`${name}: Permissions-Policy`, headers.has("permissions-policy"));
}

const landing = await get(`${APEX}/es`);
check("the landing answers", landing.status === 200, String(landing.status));
securityHeaders("the landing", landing);
check(
  "the landing has a CSP",
  landing.headers.get("content-security-policy")?.includes("default-src") ?? false,
);
await landing.arrayBuffer();

const www = await get(`${WWW}/es`);
check(
  "www goes to the apex",
  www.status === 301 && www.headers.get("location") === `${APEX}/es`,
  String(www.status),
);

const signIn = await get(`${APP}/sign-in`);
check("the app answers", signIn.status === 200, String(signIn.status));
securityHeaders("the app", signIn);
check(
  "the app has a CSP",
  signIn.headers.get("content-security-policy")?.includes("default-src") ?? false,
);
await signIn.arrayBuffer();

if (CREATOR) {
  const creator = await get(`${CREATOR}/`);
  check("a creator's page answers", creator.status === 200, String(creator.status));
  securityHeaders("a creator's page", creator);
  await creator.arrayBuffer();
}

const mcp = await get(RESOURCE, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
});
const challenge = mcp.headers.get("www-authenticate") ?? "";
check("/mcp answers 401", mcp.status === 401, String(mcp.status));
check(
  "/mcp points to its metadata",
  challenge.includes(`resource_metadata="${APP}/.well-known/oauth-protected-resource/mcp"`),
  challenge,
);

const resource = await (await get(`${APP}/.well-known/oauth-protected-resource/mcp`)).json();
check("the resource names itself", resource.resource === RESOURCE, String(resource.resource));
check("the resource names its issuer", resource.authorization_servers?.includes(ISSUER) ?? false);

const server = await (await get(`${APP}/.well-known/oauth-authorization-server/api/auth`)).json();
check("the issuer is right", server.issuer === ISSUER, String(server.issuer));
check("client metadata documents are on", server.client_id_metadata_document_supported === true);
check("dynamic registration is off", server.registration_endpoint === undefined);
check("refresh tokens are offered", server.scopes_supported?.includes("offline_access") ?? false);

const catalog = `${APEX}/es/explorar`;
await (await get(catalog)).arrayBuffer();
const second = await get(catalog);
check(
  "the storefront is cached on the second request",
  second.headers.get("cf-cache-status") === "HIT",
  String(second.headers.get("cf-cache-status")),
);
await second.arrayBuffer();

const hosts = [APEX, WWW, APP, ...(CREATOR ? [CREATOR] : [])].map((host) => `${host}/`);
const { pages, addresses, problems } = await crawl({
  starts: hosts,
  appHost: new URL(APP).host,
  frame: true,
});
check(
  `links: ${addresses} addresses, ${pages} pages, from ${hosts.length} hosts`,
  problems.length === 0,
);
for (const problem of problems) {
  console.log(`     ${problem}`);
}

console.log(failed === 0 ? "all checks passed" : `${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
