import { afterEach, describe, expect, it } from "vitest";
import { harness, json, randomEmail, randomIp } from "./auth/harness";
import { query, URLS } from "./db/connect";

// "Quiero enseñar" (Platform STEP 4 §6.3): no account, a Turnstile token checked on the
// server, and a limit per client and per address.

const api = harness();
afterEach(() => api.settle());

const valid = (over: object = {}) => ({
  name: "Ana Prueba",
  email: randomEmail(),
  teaches: "Guitarra para principiantes",
  link: "https://example.com/ana",
  locale: "es",
  token: "good-token",
  ...over,
});
const apply = (body: object, ip = randomIp()) => api.call("/api/apply", { ...json(body), ip });
const rowFor = (email: string) =>
  query(
    URLS.migrator,
    "select name, teaches, link, locale, status from creator_applications where email = $1",
    [email],
  );

describe("applying to teach", () => {
  it("keeps the application, with no account", async () => {
    const body = valid();
    const response = await apply(body);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await rowFor(body.email)).toEqual([
      {
        name: "Ana Prueba",
        teaches: "Guitarra para principiantes",
        link: "https://example.com/ana",
        locale: "es",
        status: "new",
      },
    ]);
  });

  it("takes no link, since it is optional", async () => {
    const { link: _, ...body } = valid();
    expect((await apply(body)).status).toBe(200);
  });

  it("keeps nothing when Turnstile says no, and never tells why", async () => {
    const body = valid({ token: "bad-token" });
    const response = await apply(body);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "challenge_failed" });
    expect(await rowFor(body.email)).toEqual([]);
  });

  it.each([
    ["no name", { name: "  " }],
    ["an address with no @", { email: "sin-arroba" }],
    ["nothing they teach", { teaches: "" }],
    ["a link that runs script", { link: "javascript:alert(1)" }],
    ["a link that is not one", { link: "mi canal" }],
    ["a locale we do not have", { locale: "xx" }],
    ["an unknown field", { status: "invited" }],
    ["a very long name", { name: "x".repeat(201) }],
  ])("refuses %s", async (_, over) => {
    const body = valid(over);
    const response = await apply(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "invalid_input" });
  });

  it("limits one client", async () => {
    const ip = randomIp();
    const statuses = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      statuses.push((await apply(valid(), ip)).status);
    }
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
  });

  it("limits one address, whatever its case and whichever clients send it", async () => {
    const email = randomEmail();
    const statuses = [];
    for (const address of [email, email.toUpperCase(), email, email]) {
      statuses.push((await apply(valid({ email: address }))).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it("is refused from anywhere but the app", async () => {
    const response = await api.call("/api/apply", {
      ...json(valid()),
      origin: "https://ana.app.example.test",
    });
    expect(response.status).toBe(403);
  });
});
