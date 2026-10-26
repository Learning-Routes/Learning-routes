import { Hono } from "hono";
import pkg from "../package.json" with { type: "json" };

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ ok: true, version: pkg.version }));

export default app;
