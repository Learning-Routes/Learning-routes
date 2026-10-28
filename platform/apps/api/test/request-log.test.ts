import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { logEvent } from "../src/log";

describe("the API's request log (Platform STEP 2 §1.7)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes one JSON line per request: method, path and status, never the query", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => lines.push(line));

    await app.request("/health?token=should-not-appear");

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0] as string);
    expect(entry).toMatchObject({
      message: "request",
      method: "GET",
      path: "/health",
      status: 200,
    });
    expect(typeof entry.duration_ms).toBe("number");
    expect(lines[0]).not.toContain("should-not-appear");
  });

  it("cannot log an email or a token: the type admits only ids and request facts", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    // @ts-expect-error an email is personal data and has no field in a log line
    logEvent({ message: "signed in", email: "student@example.com" });
    // @ts-expect-error a token is a secret
    logEvent({ message: "signed in", token: "abc" });
    logEvent({ message: "signed in", user_id: "0190f3a0-0000-7000-8000-000000000001" });
  });
});
