import type { MiddlewareHandler } from "hono";
import { routePath } from "hono/route";

// Structured logs (Platform STEP 2 §1.7): one JSON object per line, so Workers
// Logs can search them. A log carries ids and request facts, never an email, a
// token or an answer: the type admits only these fields and *_id ones.
type LogFields = {
  message: string;
  method?: string;
  path?: string;
  status?: number;
  duration_ms?: number;
  error?: string;
} & { [id: `${string}_id`]: string | null };

/** Writes one structured log line. */
export function logEvent(fields: LogFields): void {
  console.log(JSON.stringify(fields));
}

/**
 * One log line per request. The path is the matched route's pattern (/invite/:code),
 * never the URL, which can carry a token in a segment or the query.
 */
export const requestLog: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  await next();
  logEvent({
    message: "request",
    method: c.req.method,
    path: routePath(c, -1),
    status: c.res.status,
    duration_ms: Date.now() - start,
  });
};
