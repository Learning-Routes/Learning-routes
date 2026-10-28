import { Hono } from "hono";
import pkg from "../package.json" with { type: "json" };
import { requestLog } from "./log";

const app = new Hono<{ Bindings: Env }>();

app.use(requestLog);

app.get("/health", (c) => c.json({ ok: true, version: pkg.version }));

export default app;
