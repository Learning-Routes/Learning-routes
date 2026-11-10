import { describe, expect, it } from "vitest";
import inbox from "../src/proof-inbox/index";

const KEPT_KEY = /^andres@example\.org:\d+:[0-9a-f-]{36}$/;

function message(from: string, to: string, body: string, headerFrom = `Learning Routes <${from}>`) {
  const rejected: string[] = [];
  return {
    rejected,
    message: {
      from,
      to,
      headers: new Headers({ from: headerFrom }),
      raw: new Response(body).body,
      rawSize: body.length,
      setReject: (reason: string) => rejected.push(reason),
    } as unknown as ForwardableEmailMessage,
  };
}

function store(senderDomain = "example.com") {
  const kept: { key: string; value: string; ttl?: number }[] = [];
  return {
    kept,
    env: {
      SENDER_DOMAIN: senderDomain,
      INBOX: {
        put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
          kept.push({ key, value, ttl: options?.expirationTtl });
        },
      } as unknown as KVNamespace,
    },
  };
}

describe("the proof's private inbox", () => {
  it("keeps our own mail for an hour, under its address", async () => {
    const { env, kept } = store();
    const { message: mail, rejected } = message(
      "bounce@example.com",
      "Andres@example.org",
      "Subject: Tu invitación\r\n\r\n#token=abc",
    );
    await inbox.email(mail, env);
    expect(rejected).toEqual([]);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.key).toMatch(KEPT_KEY);
    expect(kept[0]?.value).toContain("#token=abc");
    expect(kept[0]?.ttl).toBe(3600);
  });

  it("refuses mail from anyone else, and keeps nothing", async () => {
    const { env, kept } = store();
    for (const from of ["someone@example.org"]) {
      const { message: mail, rejected } = message(from, "andres@example.org", "hi");
      await inbox.email(mail, env);
      expect(rejected).toHaveLength(1);
    }
    expect(kept).toEqual([]);
  });

  it("refuses our envelope when the From header is someone else's", async () => {
    const { env, kept } = store();
    for (const headerFrom of ["x@example.org", "Someone <x@sub.example.com>", ""]) {
      const { message: mail, rejected } = message(
        "bounce@example.com",
        "andres@example.org",
        "hi",
        headerFrom,
      );
      await inbox.email(mail, env);
      expect(rejected).toHaveLength(1);
    }
    expect(kept).toEqual([]);
  });

  it("keeps two messages that arrive in the same millisecond", async () => {
    const { env, kept } = store();
    for (const body of ["one", "two"]) {
      const { message: mail } = message("sign-in@example.com", "andres@example.org", body);
      await inbox.email(mail, env);
    }
    expect(new Set(kept.map((k) => k.key)).size).toBe(2);
  });

  it("refuses everything when no sender is configured", async () => {
    const { env, kept } = store("");
    const { message: mail, rejected } = message("a@example.com", "andres@example.org", "hi");
    await inbox.email(mail, env);
    expect(rejected).toHaveLength(1);
    expect(kept).toEqual([]);
  });

  it("refuses a message too large to be ours", async () => {
    const { env, kept } = store();
    const { message: mail, rejected } = message(
      "sign-in@example.com",
      "andres@example.org",
      "x".repeat(300_000),
    );
    await inbox.email(mail, env);
    expect(rejected).toHaveLength(1);
    expect(kept).toEqual([]);
  });
});
