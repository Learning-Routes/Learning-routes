import { describe, expect, it } from "vitest";
import { redacted } from "../scripts/dev-agent-real";

describe("the real-model launcher's output (STEP 11-prep §A1b)", () => {
  it("never shows the key, nor anything shaped like an Anthropic key", () => {
    const key = "sk-ant-api03-test-only-not-a-real-key";
    expect(redacted(`env.ANTHROPIC_API_KEY ("${key}")`, key)).toBe(
      'env.ANTHROPIC_API_KEY ("[redacted]")',
    );
    expect(redacted("other sk-ant-xyz_123 here", key)).toBe("other [redacted] here");
    expect(redacted("nothing to hide", "")).toBe("nothing to hide");
  });
});
