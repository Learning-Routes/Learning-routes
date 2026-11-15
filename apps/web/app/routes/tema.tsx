import type { PlayView } from "@learning-routes/core/actions/player";
import { PLAYER_TEXT } from "@learning-routes/core/copy/player";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import { useEffect, useState } from "react";
import { data, redirect } from "react-router";
import { runApiAction } from "../app-api.server";
import { pageContext } from "../context";
import { Player } from "../player/player";
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
  // A speaking beat records the learner on their own device; nothing is uploaded.
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
    return (
      <div className="player-wait" aria-busy="true">
        <p>{PLAYER_TEXT[locale].loading}</p>
      </div>
    );
  }
  return <Player view={view} enrollmentId={enrollmentId} locale={locale} runner={runner} />;
}
