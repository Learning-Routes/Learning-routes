import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parseJsonc } from "../jsonc";

// The MCP's signed caller to the agent Worker (agent/caller.ts): the key, what is signed, and how
// it is compared and let in. No real secret here.

const compared = vi.hoisted(() => ({ calls: 0 }));
vi.mock("../../src/security/secrets-equal", async (actual) => {
  const real = await actual<typeof import("../../src/security/secrets-equal")>();
  return {
    secretsEqual: (a: string, b: string) => {
      compared.calls++;
      return real.secretsEqual(a, b);
    },
  };
});

const { callerMessage, callerOf, overBinding, signedCaller } = await import(
  "../../src/agent/caller"
);

const SECRET = "a-test-secret-that-is-only-for-these-tests";
const PERSON = "0190f3a0-1111-7aaa-8bbb-123456789abc";
const BODY = JSON.stringify({
  space_id: "0190f3a0-2222-7aaa-8bbb-123456789abc",
  prompt: "Un volcán",
});
const NOW = 1_800_000_000_000;
const SIGNED_LINES =
  /^image\.generate\n0190f3a0-1111-7aaa-8bbb-123456789abc\n1800000060000\n[0-9a-f]{64}$/;

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

async function hmac(key: Uint8Array, message: string) {
  const imported = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", imported, new TextEncoder().encode(message)));
}

describe("the MCP's signed caller to the agent Worker", () => {
  it("(a) signs with a key derived by HKDF for this one use, never with the secret itself", async () => {
    const header = await signedCaller(SECRET, PERSON, BODY, NOW);
    const [, expiresAt, given] = header.split(".");
    const message = await callerMessage(PERSON, Number(expiresAt), BODY);
    // Not the raw secret as the HMAC key.
    expect(given).not.toBe(await hmac(new TextEncoder().encode(SECRET), message));
    // The key HKDF-SHA-256 derives from the secret with the fixed label, and no other.
    const material = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET),
      "HKDF",
      false,
      ["deriveBits"],
    );
    const derive = async (label: string) =>
      new Uint8Array(
        await crypto.subtle.deriveBits(
          {
            name: "HKDF",
            hash: "SHA-256",
            salt: new Uint8Array(0),
            info: new TextEncoder().encode(label),
          },
          material,
          256,
        ),
      );
    expect(given).toBe(await hmac(await derive("learning-routes/agent-caller/v1"), message));
    expect(given).not.toBe(await hmac(await derive("learning-routes/agent-caller/v2"), message));
    // A header forged with the raw secret is refused.
    const forged = `${PERSON}.${expiresAt}.${await hmac(new TextEncoder().encode(SECRET), message)}`;
    expect(await callerOf(forged, SECRET, BODY, NOW)).toBeNull();
  });

  it("(b) binds the purpose, the person, the expiry and the body", async () => {
    const header = await signedCaller(SECRET, PERSON, BODY, NOW);
    expect(await callerOf(header, SECRET, BODY, NOW)).toBe(PERSON);
    expect(await callerMessage(PERSON, NOW + 60_000, BODY)).toMatch(SIGNED_LINES);
    // Another body inside the minute: refused.
    const other = JSON.stringify({
      space_id: "0190f3a0-2222-7aaa-8bbb-123456789abc",
      prompt: "Otra",
    });
    expect(await callerOf(header, SECRET, other, NOW + 1_000)).toBeNull();
    // Another person, or a later expiry written over the signed one: refused.
    const [, expiresAt, given] = header.split(".");
    const someoneElse = "0190f3a0-9999-7aaa-8bbb-123456789abc";
    expect(await callerOf(`${someoneElse}.${expiresAt}.${given}`, SECRET, BODY, NOW)).toBeNull();
    expect(
      await callerOf(`${PERSON}.${Number(expiresAt) + 1}.${given}`, SECRET, BODY, NOW),
    ).toBeNull();
    // Past its expiry, or claiming to live longer than a minute: refused.
    expect(await callerOf(header, SECRET, BODY, NOW + 60_001)).toBeNull();
    const farOff = await signedCaller(SECRET, PERSON, BODY, NOW + 3_600_000);
    expect(await callerOf(farOff, SECRET, BODY, NOW)).toBeNull();
  });

  it("(c) compares in constant time, and lets in only what came over the binding", async () => {
    const header = await signedCaller(SECRET, PERSON, BODY, NOW);
    const before = compared.calls;
    await callerOf(header, SECRET, BODY, NOW);
    await callerOf(`${header.slice(0, -1)}0`, SECRET, BODY, NOW);
    expect(compared.calls - before).toBe(2);

    expect(overBinding(new Request("https://agent/internal/images", { method: "POST" }))).toBe(
      true,
    );
    expect(overBinding(new Request("https://learningroutes.com/internal/images"))).toBe(false);
    expect(overBinding(new Request("https://agent.learningroutes.com/internal/images"))).toBe(
      false,
    );
    // The agent Worker has no public address of its own.
    const config = parseJsonc(
      readFileSync(new URL("../../wrangler.agent.jsonc", import.meta.url), "utf8"),
    ) as Record<string, unknown>;
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
    expect(config.routes).toBeUndefined();
    expect(config.route).toBeUndefined();
  });
});
