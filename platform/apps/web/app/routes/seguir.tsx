import type { LessonView } from "@learning-routes/core/content/lesson-view";
import { APP_PAGES_TEXT } from "@learning-routes/core/copy/app-pages";
import { LESSON_TEXT } from "@learning-routes/core/copy/lesson";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import { useState } from "react";
import { data, redirect } from "react-router";
import { runApiAction } from "../app-api.server";
import "../app-pages/lesson.css";
import { LessonBar, LessonBlocks, TopicDone } from "../app-pages/lesson-parts";
import { filled, inLocale } from "../storefront/words";
import { ButtonLink } from "../ui/button";
import { Rising } from "../ui/rising";
import type { Route } from "./+types/seguir";

// A topic (docs/design/reference/vision/pages.html, "Un tema"): the desk, and the one celebration
// is the gold dot moving on. Reading only: saving progress waits for Platform STEP 8.

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const wanted = Number(new URL(request.url).searchParams.get("tema"));
  const answer = await runApiAction<LessonView>(context, request, "lesson.read", {
    enrollmentId: params.enrollmentId,
    ...(Number.isInteger(wanted) && wanted > 0 ? { topic: wanted } : {}),
  });
  if (answer.status === 401) {
    throw redirect("/sign-in");
  }
  if (!answer.body?.output) {
    throw data(null, { status: 404 });
  }
  return {
    lesson: answer.body.output,
    enrollmentId: params.enrollmentId,
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
  };
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData
    ? inLocale(loaderData.lesson.title, loaderData.locale, loaderData.lesson.sourceLocale)
    : "";
  return [{ title: `${title} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

export default function Seguir({ loaderData }: Route.ComponentProps) {
  const { lesson, locale, enrollmentId } = loaderData;
  const words = LESSON_TEXT[locale];
  const [done, setDone] = useState(false);
  const source = lesson.sourceLocale;
  const nextHref = lesson.next
    ? `/mis-rutas/${enrollmentId}?tema=${lesson.next.number}`
    : "/mis-rutas";
  return (
    <div className="desk opening">
      <LessonBar lesson={lesson} locale={locale} done={done} />
      <article className="lesson">
        <p className="lesson-route settle-1">{inLocale(lesson.routeTitle, locale, source)}</p>
        <h1 className="lesson-title depth-1">
          <Rising text={inLocale(lesson.title, locale, source)} />
        </h1>
        {lesson.locked ? (
          <div className="lesson-note settle-2">
            <h2 className="lesson-note-title">{words.lockedTitle}</h2>
            <p>{words.lockedBody}</p>
            <ButtonLink href="/mis-rutas">{APP_PAGES_TEXT[locale].backToMyRoutes}</ButtonLink>
          </div>
        ) : (
          <>
            <LessonBlocks
              blocks={lesson.blocks}
              locale={locale}
              source={source}
              onAllRight={() => setDone(true)}
            />
            {lesson.blocks.length === 0 ? <p className="settle-2">{words.empty}</p> : null}
            <TopicDone
              shown={done || !lesson.blocks.some((block) => block.kind === "check")}
              celebrate={done}
              locale={locale}
              href={nextHref}
              nextLine={
                lesson.next
                  ? filled(words.nextIs, {
                      n: lesson.next.number,
                      title: inLocale(lesson.next.title, locale, source),
                    })
                  : words.routeDone
              }
              action={lesson.next ? words.nextTopic : words.backToMyRoutes}
            />
          </>
        )}
      </article>
    </div>
  );
}
