import { afterEach, describe, expect, it } from "vitest";
import { query, URLS } from "../db/connect";
import { harness, json, randomEmail } from "./harness";

// Accounts with Better Auth (Platform STEP 2 §5).
const api = harness();
afterEach(() => api.settle());

describe("Better Auth, mounted at /api/auth", () => {
  it("answers on its own paths", async () => {
    const response = await api.call("/api/auth/ok");
    expect(response.status).toBe(200);
  });

  it("has no password sign-up or sign-in, and makes no user for one", async () => {
    const email = randomEmail();
    const signUp = await api.call(
      "/api/auth/sign-up/email",
      json({ email, password: "x".repeat(12), name: "A" }),
    );
    const signIn = await api.call(
      "/api/auth/sign-in/email",
      json({ email, password: "x".repeat(12) }),
    );
    expect(signUp.status).toBe(400);
    expect(await signUp.json()).toMatchObject({ code: "EMAIL_PASSWORD_SIGN_UP_DISABLED" });
    expect(signIn.ok).toBe(false);
    const users = await query(URLS.migrator, `select 1 from "user" where email = $1`, [email]);
    expect(users).toEqual([]);
  });
});
