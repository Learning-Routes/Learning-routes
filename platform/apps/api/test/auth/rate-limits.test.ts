import { afterEach, describe, expect, it } from "vitest";
import { harness, json, randomEmail } from "./harness";

// Rate limits (Platform STEP 2 §5.6), counted in the database, per client IP as
// Cloudflare reports it, so every Worker instance shares one count.

const api = harness();
afterEach(() => api.settle());

const SEND_MAX = 3;
const CONFIRM_MAX = 10;
const PER_EMAIL_MAX = 5;

const statuses = (responses: Response[]) => responses.map((response) => response.status);

describe("rate limits", () => {
  it(`let at most ${SEND_MAX} of 20 parallel link requests from one IP through`, async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        api.call("/api/auth/sign-in/magic-link", { ...json({ email: randomEmail() }), ip }),
      ),
    );
    const passed = statuses(responses).filter((status) => status === 200).length;
    expect(passed).toBeLessThanOrEqual(SEND_MAX);
    expect(passed).toBeGreaterThan(0);
    expect(statuses(responses).filter((status) => status !== 200 && status !== 429)).toEqual([]);
  });

  it(`let at most ${CONFIRM_MAX} of 20 parallel confirmations from one IP through`, async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        api.call("/api/auth/magic-link/confirm", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: crypto.randomUUID() }).toString(),
          ip,
        }),
      ),
    );
    const limited = statuses(responses).filter((status) => status === 429).length;
    expect(20 - limited).toBeLessThanOrEqual(CONFIRM_MAX);
  });

  it(`send at most ${PER_EMAIL_MAX} unused links an hour to one address, from any number of IPs`, async () => {
    const email = randomEmail();
    for (let i = 0; i < PER_EMAIL_MAX + 2; i++) {
      await api.call("/api/auth/sign-in/magic-link", json({ email }));
    }
    expect(api.sent.filter((message) => message.email === email)).toHaveLength(PER_EMAIL_MAX);
  });
});
