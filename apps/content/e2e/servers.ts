import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import worker from "../src/index";

// Three origins for the escape test: the app's page on 4310, the content host on 4311, which
// answers through the real Worker with an in-memory bucket, and a stranger's site on 4312. The app
// and the stranger count every request they get, so a request that left is seen even when the
// creation can't read its answer.

const SPACE = "0192d3a0-0000-7000-8000-0000000000a0";
const ROUTE = "0192d3a0-0000-7000-8000-0000000000b0";
const CREATION = `/p/${SPACE}/${ROUTE}/${"e".repeat(64)}.html`;
const html = await readFile(new URL("./escape.html", import.meta.url), "utf8");
const hits = { app: [] as string[], foreign: [] as string[] };
const WHERE = "?http://localhost:4310,http://localhost:4312";

const env = {
  CREATIONS: {
    get: async (key: string) => (key === `pub${CREATION.slice(2)}` ? { body: html } : null),
  },
  CONTENT_SIGNING_SECRET: "unused-but-long-enough-unused-but-long-enough",
  FRAME_ANCESTORS: "http://localhost:4310",
} as unknown as Env;

createServer(async (request, response) => {
  const answer = await worker.fetch(
    new Request(`http://127.0.0.1:4311${request.url}`) as never,
    env,
  );
  response.writeHead(answer.status, Object.fromEntries(answer.headers));
  response.end(await answer.text());
}).listen(4311);

createServer((request, response) => {
  hits.foreign.push(request.url ?? "");
  response.writeHead(200, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
  response.end("stranger");
}).listen(4312);

const frame = (sandbox: boolean) => `<!doctype html><title>The app</title>
<iframe title="creation" ${sandbox ? 'sandbox="allow-scripts"' : ""} allow="fullscreen"
  src="http://127.0.0.1:4311${CREATION}${WHERE}"></iframe>
<script>addEventListener("message", (e) => { window.outcome = e.data.escape; });</script>`;

createServer((request, response) => {
  if (request.url === "/hits?reset") {
    hits.app.length = 0;
    hits.foreign.length = 0;
  }
  if (request.url?.startsWith("/hits")) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(hits));
    return;
  }
  if (request.url === "/creation") {
    response.writeHead(302, { Location: `http://127.0.0.1:4311${CREATION}${WHERE}` });
    response.end();
    return;
  }
  if (request.url?.startsWith("/api/")) {
    hits.app.push(request.url);
    response.writeHead(200, {
      "Set-Cookie": "session=secret; Path=/",
      "Content-Type": "application/json",
    });
    response.end('{"user":"someone"}');
    return;
  }
  // As the lesson page will: its frames may show the content host and nothing else.
  response.writeHead(200, {
    "Content-Type": "text/html",
    "Set-Cookie": "__Host-lr_session=app-only; Path=/; Secure; HttpOnly",
    "Content-Security-Policy": "frame-src http://127.0.0.1:4311",
  });
  response.end(frame(request.url !== "/unsandboxed"));
}).listen(4310);
