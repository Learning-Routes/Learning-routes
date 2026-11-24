import { APP_PAGES_TEXT } from "@learning-routes/core/copy/app-pages";
import { COMMUNITY_TEXT } from "@learning-routes/core/copy/community";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import type { PostKind, ReportReason } from "@learning-routes/core/repos/community-ports";
import type { OwnEnrollment } from "@learning-routes/core/repos/ports";
import { data, Form, redirect, useNavigation } from "react-router";
import { isFromTheApp, runApiAction } from "../app-api.server";
import { AppHeader } from "../app-pages/app-header";
import "../app-pages/app-pages.css";
import "../community/community.css";
import { type Post, PostCard } from "../community/post";
import { inLocale } from "../storefront/words";
import { Notice } from "../ui/parts";
import { RouteCover } from "../ui/route-cover";
import type { Route } from "./+types/comunidad-ruta";

// A route's community (Platform STEP 22): whoever is enrolled asks, shares and answers; the
// route's creators pin and choose the answer. The server decides who may read and write.

// The same lists core keeps; a page may import core's types, never its code.
const POST_KINDS = ["question", "win", "note"] as const satisfies readonly PostKind[];
const REPORT_REASONS = ["spam", "abuse", "other"] as const satisfies readonly ReportReason[];

interface OwnList {
  enrollments: OwnEnrollment[];
  teaches: boolean;
  name: string;
  userId: string;
}

interface Thread {
  pinned: Post[];
  items: Post[];
  next: { at: number; id: string } | null;
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const [list, profile] = await Promise.all([
    runApiAction<OwnList>(context, request, "enrollment.list", {}),
    runApiAction<{ displayName: string | null }>(context, request, "profile.get", {}),
  ]);
  if (list.status === 401 || !list.body?.output) {
    throw redirect("/sign-in");
  }
  const enrollment = list.body.output.enrollments.find(
    (one) => one.enrollmentId === params.enrollmentId,
  );
  if (!enrollment) {
    throw new Response(null, { status: 404 });
  }
  const thread = await runApiAction<Thread>(context, request, "community.list", {
    routeId: enrollment.routeId,
  });
  if (!thread.body?.output) {
    throw new Response(null, { status: thread.status === 404 ? 404 : 502 });
  }
  return {
    enrollment,
    thread: thread.body.output,
    teaches: list.body.output.teaches,
    me: list.body.output.userId,
    // Whoever signed in with only an address has no name yet, and would post as "Someone".
    nameless: !(profile.body?.output?.displayName || list.body.output.name),
    now: Date.now(),
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
  };
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData ? COMMUNITY_TEXT[loaderData.locale].title : "";
  return [{ title: `${title} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

const oneOf = <T extends string>(all: readonly T[], value: unknown): T | null =>
  all.includes(value as T) ? (value as T) : null;

/** What a form asks for, as the action's name and input; null when the form is not ours. */
function asked(form: FormData, routeId: string): [string, unknown] | null {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const postId = text("postId");
  switch (text("intent")) {
    case "post": {
      const kind = oneOf(POST_KINDS, text("kind"));
      return kind && text("body")
        ? ["community.post", { routeId, kind, body: text("body") }]
        : null;
    }
    case "reply":
      return text("body") ? ["community.reply", { routeId, postId, body: text("body") }] : null;
    case "useful":
      return ["community.useful", { routeId, postId, on: text("on") === "1" }];
    case "delete":
      return ["community.delete", { routeId, postId }];
    case "name":
      return text("name") ? ["profile.update", { displayName: text("name") }] : null;
    case "report": {
      const reason = oneOf(REPORT_REASONS, text("reason"));
      return reason ? ["community.report", { routeId, postId, reason }] : null;
    }
    default:
      return null;
  }
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (!isFromTheApp(request, context)) {
    throw new Response(null, { status: 403 });
  }
  const list = await runApiAction<{ enrollments: OwnEnrollment[] }>(
    context,
    request,
    "enrollment.list",
    {},
  );
  const enrollment = list.body?.output?.enrollments.find(
    (one) => one.enrollmentId === params.enrollmentId,
  );
  if (!enrollment) {
    throw new Response(null, { status: 404 });
  }
  const form = await request.formData();
  const call = asked(form, enrollment.routeId);
  if (!call) {
    return data({ said: "failed" as const }, { status: 400 });
  }
  const answer = await runApiAction(context, request, call[0], call[1]);
  if (answer.body?.ok) {
    return { said: call[0] === "community.report" ? ("reported" as const) : ("done" as const) };
  }
  // Reported before: the person already did what they came to do.
  if (call[0] === "community.report" && answer.status === 409) {
    return { said: "reported" as const };
  }
  const tooMuch = answer.status === 429 || answer.body?.code === "rate_limited";
  return data({ said: tooMuch ? ("tooMuch" as const) : ("failed" as const) }, { status: 400 });
}

export default function Comunidad({ loaderData, actionData }: Route.ComponentProps) {
  const { enrollment, thread, teaches, me, nameless, now, locale } = loaderData;
  // A second press while the first is on its way would write the same thing twice.
  const isSending = useNavigation().state !== "idle";
  const words = COMMUNITY_TEXT[locale];
  const base = `/mis-rutas/${enrollment.enrollmentId}`;
  // A deleted post stays only while it holds replies: alone, it says nothing to anyone.
  const posts = [...thread.pinned, ...thread.items].filter(
    (post) => !(post.isDeleted && post.replies.length === 0),
  );
  const said = actionData?.said;
  return (
    <div className="desk">
      <AppHeader locale={locale} place="community" teaches={teaches} />
      <main className="app-page cm-page">
        <header className="cm-top">
          <RouteCover seed={enrollment.routeId} className="cm-cover" />
          <div className="cm-top-words">
            <p className="cm-creator">{inLocale(enrollment.creator, locale)}</p>
            <h1 className="cm-title">
              {inLocale(enrollment.title, locale, enrollment.sourceLocale)}
            </h1>
          </div>
          <nav className="cm-tabs" aria-label={words.title}>
            <a href={base}>{words.lessons}</a>
            <a href={`/comunidad/${enrollment.enrollmentId}`} aria-current="page">
              {words.community}
            </a>
          </nav>
        </header>
        {said === "reported" ? <Notice tone="success" title={words.reported} /> : null}
        {said === "tooMuch" ? <Notice tone="error" title={words.tooMuch} /> : null}
        {said === "failed" ? <Notice tone="error" title={words.failed} /> : null}
        {nameless ? (
          <Form method="post" className="cm-name">
            <input type="hidden" name="intent" value="name" />
            <label htmlFor="cm-name">{words.nameAsk}</label>
            <input
              className="cm-input cm-name-input"
              id="cm-name"
              name="name"
              required
              maxLength={60}
              placeholder={words.nameLabel}
              autoComplete="given-name"
            />
            <button
              type="submit"
              className="button button-secondary button-small"
              disabled={isSending}
            >
              <span className="button-label">{words.nameSave}</span>
            </button>
          </Form>
        ) : null}
        <Form method="post" id="preguntar" className="cm-compose" key={posts[0]?.id ?? "first"}>
          <input type="hidden" name="intent" value="post" />
          <textarea
            className="cm-input cm-area"
            name="body"
            required
            maxLength={2000}
            rows={2}
            placeholder={words.placeholder}
            aria-label={words.placeholder}
          />
          <div className="cm-compose-row">
            <fieldset className="cm-kinds">
              <legend>{words.kindLabel}</legend>
              {POST_KINDS.map((kind, index) => (
                <label key={kind} className="cm-kind-pick">
                  <input type="radio" name="kind" value={kind} defaultChecked={index === 0} />
                  <span>
                    {
                      { question: words.kindQuestion, win: words.kindWin, note: words.kindNote }[
                        kind
                      ]
                    }
                  </span>
                </label>
              ))}
            </fieldset>
            <button
              type="submit"
              className="button button-primary button-regular"
              disabled={isSending}
            >
              <span className="button-label">{words.publish}</span>
            </button>
          </div>
        </Form>
        {posts.length === 0 ? (
          <div className="cm-empty">
            <h2>{words.empty}</h2>
            <p>{words.emptyBody}</p>
          </div>
        ) : (
          <ol className="cm-posts">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} words={words} locale={locale} now={now} me={me} />
            ))}
          </ol>
        )}
        <a className="text-link" href={base}>
          {APP_PAGES_TEXT[locale].continue}
        </a>
      </main>
    </div>
  );
}
