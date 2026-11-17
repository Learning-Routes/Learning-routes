import type { PlayView } from "@learning-routes/core/actions/player";
import { PRACTICE_TEXT } from "@learning-routes/core/copy/practice";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import { useEffect, useState } from "react";
import { data, redirect } from "react-router";
import { runApiAction } from "../app-api.server";
import { pageContext } from "../context";
import { firstOpen } from "../player/first-open";
import { Player } from "../player/player.client";
import { inLocale } from "../storefront/words";
import { lessonPage } from "../surface";
import type { Route } from "./+types/tema";

// A topic in the player (Platform STEP 12). The server sends the beats without their answers; the
// player draws in the browser only, after the first paint, so the creator's colour and every moving
// part are set through the CSSOM, which the strict CSP allows, and never as inline style.

export const handle = lessonPage;

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const topic = Number(params.n);
  if (!Number.isInteger(topic) || topic < 1) {
    throw data(null, { status: 404 });
  }
  const answer = await runApiAction<PlayView>(context, request, "lesson.play", {
    enrollmentId: params.enrollmentId,
    topic,
  });
  if (answer.status === 401) {
    throw redirect("/sign-in");
  }
  if (!answer.body?.output) {
    throw data(null, {
      status: answer.status === 429 || answer.status >= 500 ? answer.status : 404,
    });
  }
  const view = answer.body.output;
  if (view.locked) {
    throw redirect(`/mis-rutas/${params.enrollmentId}?tema=${topic}`);
  }
  const { contentOrigin } = context.get(pageContext);
  return {
    view,
    enrollmentId: params.enrollmentId,
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
    runner: contentOrigin ? `${contentOrigin}/run/js` : null,
  };
}

export const headers: Route.HeadersFunction = () => ({
  "Cache-Control": "no-store",
  // A speaking beat listens through the browser's own speech recognition, which may send the audio
  // to the browser maker's service to turn it into text. The page itself uploads nothing.
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(self), payment=(), usb=()",
});

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData
    ? inLocale(loaderData.view.title, loaderData.locale, loaderData.view.sourceLocale)
    : "";
  return [{ title: `${title} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

export default function Tema({ loaderData }: Route.ComponentProps) {
  const { view, enrollmentId, locale, runner } = loaderData;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <PlayerShell view={view} locale={locale} />;
  }
  return <Player view={view} enrollmentId={enrollmentId} locale={locale} runner={runner} />;
}

/**
 * What the server sends before the player wakes (Platform STEP 15): its bar and the topic's
 * title, in the player's own classes, so the page is the lesson at once and not a wait. No
 * inline style: the CSP allows none in HTML, and the player sets its colours once it runs.
 */
function PlayerShell({
  view,
  locale,
}: {
  view: PlayView;
  locale: Route.ComponentProps["loaderData"]["locale"];
}) {
  const say = (text: PlayView["title"]) => inLocale(text, locale, view.sourceLocale);
  // The same bar the player draws on its first frame, so nothing moves when it takes over. It
  // is drawn only: the player's own bar, with its label, replaces it a moment later.
  const at = firstOpen(view);
  return (
    <div className="player" aria-busy="true">
      <div className="p-topbar">
        <p className="p-topbar-route">{say(view.routeTitle)}</p>
        <div className="p-segs" aria-hidden="true">
          {view.beats.map((beat, i) => (
            <i key={beat.id} className={i < at ? "is-done" : i === at ? "is-now" : ""} />
          ))}
        </div>
        <span className="p-xp">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" />
          </svg>
          {view.xp.topic} XP
        </span>
      </div>
      <div className="p-body">
        <main className="p-main">
          <div className="p-content">
            <h1 className="p-title">{say(view.title)}</h1>
            <p className="p-sub">{PRACTICE_TEXT[locale].opening}</p>
          </div>
        </main>
      </div>
    </div>
  );
}
