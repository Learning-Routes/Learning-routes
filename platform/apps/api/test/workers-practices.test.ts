import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Platform STEP 2 §1.7: Cloudflare's Workers practices, held by tests over both
// Workers' source and configuration.
const sources: Record<string, string> = import.meta.glob(
  ["../src/**/*.ts", "../../web/app/**/*.{ts,tsx}", "../../web/workers/**/*.ts"],
  { query: "?raw", import: "default", eager: true },
);

const DESTRUCTURED_CTX = /\{[^}]*\}\s*=\s*ctx\b|\(\s*\{\s*waitUntil\b/;
const MODULE_STATE =
  /^(?:export\s+)?(?:let|var)\s|^(?:export\s+)?const\s+\w+\s*(?::[^=]+)?=\s*new\s+(?:Map|Set|WeakMap|Client|Pool|pg\.Client|pg\.Pool)\b/m;
const HAND_WRITTEN_ENV = /\binterface\s+Env\b|\btype\s+Env\s*=/;
const SECRET_EQUALITY = /\w*(?:secret|token)\w*\s*[!=]==|[!=]==\s*\w*(?:secret|token)\w*/i;

function offenders(pattern: RegExp) {
  return Object.entries(sources)
    .filter(([, text]) => pattern.test(text))
    .map(([file]) => file);
}

function wrangler(app: "api" | "web") {
  const text = readFileSync(new URL(`../../${app}/wrangler.jsonc`, import.meta.url), "utf8");
  return JSON.parse(
    text
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n"),
  );
}

describe("Workers practices", () => {
  it("reads both Workers' source", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
  });

  it.each(["api", "web"] as const)("%s logs and traces, with sampling set in its config", (app) => {
    const { observability } = wrangler(app);
    expect(observability.enabled).toBe(true);
    expect(observability.logs).toMatchObject({
      enabled: true,
      head_sampling_rate: expect.any(Number),
    });
    expect(observability.traces).toMatchObject({
      enabled: true,
      head_sampling_rate: expect.any(Number),
    });
  });

  it("never destructures ctx: ctx.waitUntil keeps its receiver", () => {
    expect(offenders(DESTRUCTURED_CTX)).toEqual([]);
  });

  it("keeps no request state at module level: no let, no shared client or map", () => {
    expect(offenders(MODULE_STATE)).toEqual([]);
  });

  it("takes Env only from wrangler types", () => {
    expect(offenders(HAND_WRITTEN_ENV)).toEqual([]);
  });

  it("never compares a secret or token with === ", () => {
    expect(offenders(SECRET_EQUALITY)).toEqual([]);
  });
});
