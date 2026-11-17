import { afterEach, describe, expect, it } from "vitest";
import { query, URLS } from "./db/connect";
import { oauthHarness } from "./mcp/oauth-harness";

// The learner's tutor over HTTP (Platform STEP 20 §A), where no model is needed: it fails politely
// without a key, takes no question then, and is never reachable through the generic action route,
// whose answer would be the model's instructions.

const oauth = oauthHarness("https://client.example.test/tutor-http.json");
afterEach(() => oauth.settle());

const json = { "content-type": "application/json" };

describe("the tutor over HTTP", () => {
  it("answers 503 tutor_unavailable in the person's language with no key, and keeps the question", async () => {
    expect((await oauth.api.call("/api/tutor/ask", { method: "POST", body: "{}" })).status).toBe(
      401,
    );
    const person = await oauth.signIn();
    const answer = await oauth.api.call("/api/tutor/ask", {
      method: "POST",
      headers: { ...json, cookie: person.cookie, "accept-language": "es" },
      body: JSON.stringify({
        enrollment_id: crypto.randomUUID(),
        topic: 1,
        question: "¿Qué es esto?",
      }),
    });
    expect(answer.status).toBe(503);
    expect(await answer.json()).toEqual({
      ok: false,
      code: "tutor_unavailable",
      message: "El tutor no puede responder ahora. Inténtalo más tarde.",
    });
    const [taken] = await query(
      URLS.migrator,
      `select count(*)::integer as n from tutor_questions
        where user_id = (select id from "user" where email = $1)`,
      [person.email],
    );
    expect(taken?.n).toBe(0);
  });

  it("is not an action the generic route runs", async () => {
    const person = await oauth.signIn();
    const answer = await oauth.api.call("/api/a/tutor.ask", {
      method: "POST",
      headers: { ...json, cookie: person.cookie },
      body: JSON.stringify({ enrollmentId: crypto.randomUUID(), topic: 1, question: "¿Y?" }),
    });
    expect(answer.status).toBe(404);
    expect(await answer.json()).toEqual({ ok: false, code: "unknown_action" });
  });
});
