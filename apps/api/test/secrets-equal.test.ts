import { describe, expect, it } from "vitest";
import { secretsEqual } from "../src/security/secrets-equal";

describe("secretsEqual, a constant-time comparison (Platform STEP 2 §1.7)", () => {
  it("matches equal secrets", async () => {
    expect(await secretsEqual("s3cret-value", "s3cret-value")).toBe(true);
  });

  it("refuses a different one, and one of a different length, without leaking it", async () => {
    expect(await secretsEqual("s3cret-value", "s3cret-valuX")).toBe(false);
    expect(await secretsEqual("s3cret-value", "s3cret")).toBe(false);
    expect(await secretsEqual("", "x")).toBe(false);
  });
});
