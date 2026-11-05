import { createServer } from "node:http";
import worker from "../src/index";

// Two origins for the escape test: the app's page on 4310, and the content host on 4311, which
// answers through the real Worker with an in-memory bucket.

const SPACE = "0192d3a0-0000-7000-8000-0000000000a0";
const ROUTE = "0192d3a0-0000-7000-8000-0000000000b0";
export const CREATION = `/p/${SPACE}/${ROUTE}/${"e".repeat(64)}.html`;
const html = await (await import("node:fs/promises")).readFile(
  new URL("./escape.html", import.meta.url),
  "utf8",
);

const env = {
  CREATIONS: {
    get: async (key: string) => (key === `pub${CREATION.slice(2)}` ? { body: html } : null),
  },
  CONTENT_SIGNING_SECRET: "unused",
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
  if (request.url?.startsWith("/api/")) {
    response.writeHead(200, {
      "Set-Cookie": "session=secret; Path=/",
      "Content-Type": "application/json",
    });
    response.end('{"user":"someone"}');
    return;
  }
  response.writeHead(200, {
    "Content-Type": "text/html",
    "Set-Cookie": "__Host-lr_session=app-only; Path=/; Secure; HttpOnly",
  });
  response.end(`<!doctype html><title>The app</title>
<iframe title="creation" sandbox="allow-scripts" allow="autoplay; fullscreen"
  src="http://127.0.0.1:4311${CREATION}?http://localhost:4310"></iframe>
<script>addEventListener("message", (e) => { window.outcome = e.data.escape; });</script>`);
}).listen(4310);
