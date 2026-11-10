import { runAction } from "@learning-routes/core/actions/define";
import { ACTIONS } from "@learning-routes/core/actions/registry";
import { negotiateLocale } from "@learning-routes/core/locales";
import type { Context, Hono } from "hono";
import * as z from "zod";
import { AUTH_PATH, createAuth, takeFromWindow } from "./auth/auth";
import { maskAddress } from "./auth/confirm";
import type { EmailSender } from "./auth/email";
import { identifierOf } from "./auth/magic-token";
import { pgRepos } from "./db/repos/index";
import { pgTenancy } from "./db/tenancy";
import { type Database, transactionAs, withClient } from "./db/with-db";
import { newId } from "./ids";

// Invitations to teach (Platform STEP 10, pulled forward). An operator sends one; its link holds
// a token only in the fragment, kept here only as a hash, good once for 7 days. Using it signs
// the person in, through the same code as a sign-in link, and makes their space.

const SEVEN_DAYS_MS = 7 * 86_400_000;
const LINK_PATH = "/invitacion";
const FIVE_MINUTES_MS = 300_000;
const PEEKS_PER_CLIENT = 20;
const PEEK_WINDOW_MS = 600_000;
// A new creator starts with their assistant, at its first step (Platform STEP 10 §5).
const CREATOR_HOME = "/creador/asistente";

interface InvitedTo {
  email: string;
  name: string;
  locale: never;
}

const Send = z.strictObject({ applicationId: z.uuid() });
const Peek = z.strictObject({ token: z.string().min(16).max(128) });
const Accept = z.strictObject({ token: z.string().min(16).max(128), slug: z.string().max(63) });

const ctxFor = (db: Parameters<typeof pgRepos>[0], userId: string) => ({
  actor: { via: "ui" as const, userId },
  repos: pgRepos(db),
  tenancy: pgTenancy(db as never),
  clock: { now: () => Date.now() },
  ids: { newId },
});

const previewOf = (db: Database, hash: string) =>
  transactionAs(db, null, (tx) => pgRepos(tx).invitations.preview(hash));

/** Signs in the invited address, as following a sign-in link would. Its cookies, and who it is. */
async function signIn(
  c: Context<{ Bindings: Env }>,
  db: Database,
  sender: EmailSender,
  email: string,
  name: string,
) {
  const auth = createAuth(c.env, db, sender);
  const { internalAdapter } = await auth.$context;
  const token = crypto.randomUUID();
  await internalAdapter.createVerificationValue({
    identifier: `magic-link:${await identifierOf(token)}`,
    value: JSON.stringify({ type: "magic-link", email, name }),
    expiresAt: new Date(Date.now() + FIVE_MINUTES_MS),
  });
  const verify = new URL(`${c.env.APP_ORIGIN}${AUTH_PATH}/magic-link/verify`);
  verify.searchParams.set("token", token);
  verify.searchParams.set("callbackURL", CREATOR_HOME);
  verify.searchParams.set("errorCallbackURL", LINK_PATH);
  const answer = await auth.handler(new Request(verify, { headers: c.req.raw.headers }));
  const cookies = answer.headers.getSetCookie();
  const found = await internalAdapter.findUserByEmail(email);
  return { cookies, userId: cookies.length > 0 ? (found?.user.id ?? null) : null };
}

const newToken = () => `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");

type Ctx = Context<{ Bindings: Env }>;

async function send(c: Ctx, sender: EmailSender, applicationId: string) {
  const token = newToken();
  return withClient(c.env, c.executionCtx, async (db) => {
    const session = await createAuth(c.env, db, sender).api.getSession({
      headers: c.req.raw.headers,
    });
    if (session === null) {
      return c.json({ ok: false, code: "unauthenticated" }, 401);
    }
    const userId = session.user.id;
    const tokenHash = await identifierOf(token);
    const expiresAt = Date.now() + SEVEN_DAYS_MS;
    const invited = await transactionAs(db, userId, (tx) =>
      runAction(
        ACTIONS,
        "application.invite",
        { applicationId, tokenHash, expiresAt },
        ctxFor(tx, userId),
      ),
    );
    if (!invited.ok) {
      return c.json({ ok: false, code: invited.code }, 404);
    }
    const { email, name, locale } = invited.output as InvitedTo;
    // In the fragment: no request, and so no log, ever carries it.
    const url = `${c.env.APP_ORIGIN}${LINK_PATH}#token=${token}`;
    try {
      await sender.sendInvitation({ email, name, locale, url });
    } catch {
      // The row stays, and sending again replaces it.
      return c.json({ ok: false, code: "not_sent" }, 502);
    }
    return c.json({ ok: true });
  });
}

/** Reads the invitation and leaves it. Only accept uses it up. */
async function peek(c: Ctx, sender: EmailSender, hash: string) {
  const client = c.req.header("cf-connecting-ip") ?? "unknown";
  return withClient(c.env, c.executionCtx, async (db) => {
    const { adapter } = await createAuth(c.env, db, sender).$context;
    const key = `invitation-peek:${client}`;
    if (!(await takeFromWindow(adapter, key, PEEKS_PER_CLIENT, PEEK_WINDOW_MS))) {
      return c.json({ code: "too_many_requests" }, 429);
    }
    const { state, email, name, locale } = await previewOf(db, hash);
    return c.json(
      state === "ok" && email
        ? { state, email: maskAddress(email), name, locale }
        : { state, locale: locale ?? negotiateLocale(c.req.header("accept-language")) },
    );
  });
}

const REFUSED = { conflict: 409, invalid_input: 400 } as const;

async function accept(c: Ctx, sender: EmailSender, hash: string, slug: string) {
  return withClient(c.env, c.executionCtx, async (db) => {
    const { state, email, name } = await previewOf(db, hash);
    if (state !== "ok" || !email) {
      return c.json({ ok: false, code: state }, 410);
    }
    const { cookies, userId } = await signIn(c, db, sender, email, name ?? "");
    if (userId === null) {
      return c.json({ ok: false, code: "failed" }, 500);
    }
    for (const cookie of cookies) {
      c.header("set-cookie", cookie, { append: true });
    }
    const accepted = await transactionAs(db, userId, (tx) =>
      runAction(ACTIONS, "invitation.accept", { tokenHash: hash, slug }, ctxFor(tx, userId)),
    );
    if (!accepted.ok) {
      const status = REFUSED[accepted.code as keyof typeof REFUSED] ?? 410;
      return c.json({ ok: false, code: accepted.code }, status);
    }
    return c.json({ ok: true, location: CREATOR_HOME });
  });
}

export function invitationRoutes(
  app: Hono<{ Bindings: Env }>,
  emailSender: (env: Env) => EmailSender,
) {
  app.post("/api/invitations/send", async (c) => {
    c.header("Cache-Control", "no-store");
    const input = Send.safeParse(await c.req.json().catch(() => null));
    return input.success
      ? send(c, emailSender(c.env), input.data.applicationId)
      : c.json({ ok: false, code: "invalid_input" }, 400);
  });
  app.post("/api/invitations/peek", async (c) => {
    c.header("Cache-Control", "no-store");
    const input = Peek.safeParse(await c.req.json().catch(() => null));
    return input.success
      ? peek(c, emailSender(c.env), await identifierOf(input.data.token))
      : c.json({ state: "unknown" });
  });
  app.post("/api/invitations/accept", async (c) => {
    c.header("Cache-Control", "no-store");
    const input = Accept.safeParse(await c.req.json().catch(() => null));
    return input.success
      ? accept(c, emailSender(c.env), await identifierOf(input.data.token), input.data.slug)
      : c.json({ ok: false, code: "invalid_input" }, 400);
  });
}
