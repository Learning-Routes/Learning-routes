import { afterEach, describe, expect, it } from "vitest";
import { emailRateKey } from "../../src/auth/rate-key";
import { query, URLS } from "../db/connect";
import { harness, json, randomEmail, randomIp, TEST_SECRET } from "./harness";

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
    const ip = randomIp();
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
    const ip = randomIp();
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
    expect(limited).toBeLessThan(20);
  });

  it(`send at most ${PER_EMAIL_MAX} links in ten minutes to one address, from any number of IPs`, async () => {
    const email = randomEmail();
    for (let i = 0; i < PER_EMAIL_MAX + 2; i++) {
      await api.call("/api/auth/sign-in/magic-link", json({ email }));
    }
    expect(api.sent.filter((message) => message.email === email)).toHaveLength(PER_EMAIL_MAX);
  });

  it("count an address whatever its letter case, and only that address", async () => {
    const local = `learner_${crypto.randomUUID().slice(0, 8)}`;
    const variants = Array.from(
      { length: PER_EMAIL_MAX + 2 },
      (_, i) => `${i % 2 === 0 ? local.toUpperCase() : local}@example.com`,
    );
    for (const email of variants) {
      await api.call("/api/auth/sign-in/magic-link", json({ email }));
    }
    const sent = api.sent.filter(
      (message) => message.email.toLowerCase() === `${local}@example.com`,
    );
    expect(sent).toHaveLength(PER_EMAIL_MAX);
    // An underscore is not a wildcard: a neighbouring address is counted apart.
    const neighbour = `${local.replace("_", "x")}@example.com`;
    await api.call("/api/auth/sign-in/magic-link", json({ email: neighbour }));
    expect(api.sent.some((message) => message.email === neighbour)).toBe(true);
  });

  it("store no address: an address's count is keyed by an HMAC of it with the auth secret", async () => {
    const email = randomEmail();
    await api.call("/api/auth/sign-in/magic-link", json({ email: email.toUpperCase() }));
    const plain = await query(
      URLS.migrator,
      "select 1 from rate_limit where key like '%' || $1 || '%'",
      [email.split("@")[0]],
    );
    expect(plain).toEqual([]);
    const keyed = await query(URLS.migrator, "select count from rate_limit where key = $1", [
      await emailRateKey(TEST_SECRET, email),
    ]);
    expect(keyed).toEqual([{ count: 1 }]);
  });

  it(`start a new window once the old one is over, and still send at most ${PER_EMAIL_MAX} of 20 parallel links`, async () => {
    const email = randomEmail();
    // A full window that ended an hour ago.
    await query(
      URLS.migrator,
      "insert into rate_limit (key, count, last_request) values ($1, $2, $3)",
      [await emailRateKey(TEST_SECRET, email), PER_EMAIL_MAX, Date.now() - 3_600_000],
    );
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => api.call("/api/auth/sign-in/magic-link", json({ email }))),
    );
    const sent = api.sent.filter((message) => message.email === email).length;
    expect(sent).toBeLessThanOrEqual(PER_EMAIL_MAX);
    expect(sent).toBeGreaterThan(0);
    expect(statuses(responses).filter((status) => status !== 200 && status !== 429)).toEqual([]);
  });
});
