import { afterEach, describe, expect, it } from "vitest";
import { harness, json, randomEmail } from "./auth/harness";
import { query, URLS } from "./db/connect";

// Invitations to teach (Platform STEP 10, pulled forward): an operator's button mails a link,
// good once for 7 days, and using it makes the account, the space and the session.

const api = harness();
afterEach(() => api.settle());

async function operator() {
  const email = randomEmail();
  await api.call("/api/auth/sign-in/magic-link", json({ email }));
  const link = api.sent.find((message) => message.email === email);
  const token = new URLSearchParams(new URL(link?.url ?? "").hash.slice(1)).get("token") ?? "";
  const confirmed = await api.call("/api/auth/magic-link/confirm", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  });
  const cookie =
    confirmed.headers
      .getSetCookie()
      .find((entry) => entry.startsWith("__Host-lr_session"))
      ?.split(";")[0] ?? "";
  await query(
    URLS.migrator,
    `insert into platform_roles (user_id, is_operator)
     select id, true from "user" where email = $1`,
    [email],
  );
  return cookie;
}

async function application() {
  const email = randomEmail();
  const [row] = await query(
    URLS.migrator,
    `insert into creator_applications (name, email, teaches, locale)
     values ('Andrés Profe', $1, 'Matemáticas', 'es') returning id`,
    [email],
  );
  return { email, id: row.id as string };
}

async function invited(cookie: string, id: string) {
  const request = json({ applicationId: id });
  const answer = await api.call("/api/invitations/send", {
    ...request,
    headers: { ...request.headers, cookie },
  });
  expect(answer.status).toBe(200);
  const message = api.invitations.at(-1);
  return new URLSearchParams(new URL(message?.url ?? "").hash.slice(1)).get("token") ?? "";
}

const peek = async (token: string) =>
  (await (await api.call("/api/invitations/peek", json({ token }))).json()) as {
    state: string;
    email?: string;
  };
// Each from an address of its own: signing in has a limit per address.
const accept = (token: string, slug: string) => {
  const request = json({ token, slug });
  return api.call("/api/invitations/accept", {
    ...request,
    headers: {
      ...request.headers,
      "cf-connecting-ip": `203.0.113.${Math.floor(Math.random() * 250)}`,
    },
  });
};
const slugOf = () => `andres-${crypto.randomUUID().slice(0, 8)}`;

describe("an invitation", () => {
  it("is mailed by an operator, logged, and keeps no token in the database", async () => {
    const cookie = await operator();
    const { id, email } = await application();
    const token = await invited(cookie, id);
    expect(api.invitations.at(-1)?.email).toBe(email);
    expect(api.invitations.at(-1)?.url).toContain("/invitacion#token=");
    const rows = await query(
      URLS.migrator,
      "select token_hash from creator_invitations where application_id = $1",
      [id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(token);
    const log = await query(
      URLS.migrator,
      `select input::text as input from action_log where action = 'application.invite' order by id desc limit 1`,
    );
    expect(log[0].input).not.toContain(rows[0].token_hash);
  });

  it("does nothing for someone who is not an operator", async () => {
    const { id } = await application();
    const answer = await api.call("/api/invitations/send", json({ applicationId: id }));
    expect(answer.status).toBe(401);
    expect(api.invitations.filter((message) => message.url.includes(id))).toEqual([]);
  });

  it("makes the account, an owner's space and a session, then is spent", async () => {
    const cookie = await operator();
    const { id, email } = await application();
    const token = await invited(cookie, id);
    expect((await peek(token)).state).toBe("ok");
    const slug = slugOf();
    const answer = await accept(token, slug);
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ ok: true, location: "/creador/asistente" });
    expect(answer.headers.getSetCookie().join()).toContain("__Host-lr_session");
    const owners = await query(
      URLS.migrator,
      `select m.role from memberships m join spaces s on s.id = m.space_id
       join "user" u on u.id = m.user_id where s.slug = $1 and u.email = $2`,
      [slug, email],
    );
    expect(owners).toEqual([{ role: "owner" }]);
    const log = await query(
      URLS.migrator,
      "select count(*)::int as n from action_log where action = 'invitation.accept' and space_id = (select id from spaces where slug = $1)",
      [slug],
    );
    expect(log[0].n).toBe(1);

    expect((await peek(token)).state).toBe("used");
    const again = await accept(token, slugOf());
    expect(again.status).toBe(410);
    expect(await again.json()).toMatchObject({ code: "used" });
  });

  it("says when it has expired, and when it is unknown", async () => {
    const cookie = await operator();
    const { id } = await application();
    const token = await invited(cookie, id);
    await query(
      URLS.migrator,
      "update creator_invitations set expires_at = now() - interval '1 minute' where application_id = $1",
      [id],
    );
    expect((await peek(token)).state).toBe("expired");
    expect((await accept(token, slugOf())).status).toBe(410);
    expect((await peek("a".repeat(40))).state).toBe("unknown");
  });

  it("replaces the old link when sent again", async () => {
    const cookie = await operator();
    const { id } = await application();
    const first = await invited(cookie, id);
    const second = await invited(cookie, id);
    expect((await peek(first)).state).toBe("unknown");
    expect((await peek(second)).state).toBe("ok");
  });

  it("asks again when the address is taken, and the link still works", async () => {
    const cookie = await operator();
    const taken = slugOf();
    const one = await application();
    expect((await accept(await invited(cookie, one.id), taken)).status).toBe(200);
    const two = await application();
    const token = await invited(cookie, two.id);
    expect((await accept(token, taken)).status).toBe(409);
    expect((await peek(token)).state).toBe("ok");
    expect((await accept(token, slugOf())).status).toBe(200);
  });

  it("refuses an address the platform keeps", async () => {
    const cookie = await operator();
    const { id } = await application();
    const token = await invited(cookie, id);
    expect((await accept(token, "admin")).status).toBe(400);
    expect((await peek(token)).state).toBe("ok");
  });
});
