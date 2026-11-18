import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { authOptions } from "../../src/auth/options";
import { memoryAdapter } from "../../src/auth/unused/memory-adapter";
import { createTelemetry } from "../../src/auth/unused/telemetry";
import { parseJsonc } from "../jsonc";

// The three Workers build without Better Auth's telemetry and in-memory database
// (src/auth/unused). That holds only while telemetry stays off and a database is always given.

const ALIAS = {
  "@better-auth/telemetry": "./src/auth/unused/telemetry.ts",
  "@better-auth/memory-adapter": "./src/auth/unused/memory-adapter.ts",
};

describe("Better Auth modules the Workers never run", () => {
  it.each(["wrangler.jsonc", "wrangler.agent.jsonc", "wrangler.mcp.jsonc"])(
    "%s leaves both out",
    (file) => {
      const config = parseJsonc(
        readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"),
      ) as {
        alias?: unknown;
      };
      expect(config.alias).toEqual(ALIAS);
    },
  );

  it("is safe only with telemetry off, and then publishing does nothing", async () => {
    expect(authOptions.telemetry.enabled).toBe(false);
    const { publish } = await createTelemetry();
    await expect(publish({ type: "init" })).resolves.toBeUndefined();
  });

  it("refuses to keep sessions in memory", () => {
    expect(() => memoryAdapter({})).toThrow("built without a database");
  });
});
