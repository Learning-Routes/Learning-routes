import { Hono } from "hono";
import pkg from "../package.json" with { type: "json" };
import { logEvent } from "./log";

const app = new Hono<{ Bindings: Env }>();

// One log line per request: the path without its query, which can carry a token.
app.use(async (c, next) => {
  const start = Date.now();
  await next();
  logEvent({
    message: "request",
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    status: c.res.status,
    duration_ms: Date.now() - start,
  });
});

app.get("/health", (c) => c.json({ ok: true, version: pkg.version }));

export default app;
