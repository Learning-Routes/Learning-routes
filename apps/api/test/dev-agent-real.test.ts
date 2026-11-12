import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { realConfig, redacted } from "../scripts/dev-agent-real";

describe("the real-model launcher's output (STEP 11-prep §A1b)", () => {
  it("never shows the key, nor anything shaped like an Anthropic key", () => {
    const key = "sk-ant-api03-test-only-not-a-real-key";
    expect(redacted(`env.ANTHROPIC_API_KEY ("${key}")`, key)).toBe(
      'env.ANTHROPIC_API_KEY ("[redacted]")',
    );
    expect(redacted("other sk-ant-xyz_123 here", key)).toBe("other [redacted] here");
    expect(redacted("nothing to hide", "")).toBe("nothing to hide");
  });

  it("requires the key by name in its own copy of the config, and never holds it", () => {
    const config = realConfig(readFileSync("wrangler.agent.jsonc", "utf8"));
    expect(config).toContain('"main": "../src/agent/index.ts"');
    expect(config).toContain('"required": ["BETTER_AUTH_SECRET", "ANTHROPIC_API_KEY"]');
    expect(config).not.toContain("sk-ant-");
    expect(() => realConfig("{}")).toThrow();
  });
});
