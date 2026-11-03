import { APP_PAGES_TEXT } from "@learning-routes/core/copy/app-pages";
import { CATALOG_TEXT } from "@learning-routes/core/copy/catalog";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import type { OwnEnrollment } from "@learning-routes/core/repos/ports";
import { routeLine } from "@learning-routes/route-map/route-line";
import { useEffect } from "react";
import { redirect } from "react-router";
import { runApiAction } from "../app-api.server";
import "../app-pages/app-pages.css";
import { pageContext } from "../context";
import { filled, inLocale } from "../storefront/words";
import { ButtonLink } from "../ui/button";
import { EmptyState } from "../ui/parts";
import type { Route } from "./+types/mis-rutas";

// "Mis rutas", minimal, from v2's MisRutas (Platform STEP 4 §6.2).

export async function loader({ request, context }: Route.LoaderArgs) {
  const answer = await runApiAction<{ enrollments: OwnEnrollment[]; teaches: boolean }>(
    context,
    request,
    "enrollment.list",
    {},
  );
  if (answer.status === 401 || !answer.body?.output) {
    throw redirect("/sign-in");
  }
  return {
    ...answer.body.output,
    newEnrollment: new URL(request.url).searchParams.get("nueva"),
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
    platformOrigin: context.get(pageContext).platformOrigin,
  };
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData ? APP_PAGES_TEXT[loaderData.locale].myRoutes : "";
  return [{ title: `${title} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

function EnrollmentLine({
  lessons,
  completed,
  seed,
  isNew,
}: {
  lessons: number[];
  completed: number;
  seed: string;
  isNew: boolean;
}) {
  const line = routeLine(lessons, seed);
  const total = lessons.reduce((sum, count) => sum + count, 0);
  const done = total === 0 ? 0 : Math.min(1, completed / total);
  return (
    <svg
      className={`route-line ${isNew ? "route-line-new" : ""}`.trim()}
      viewBox="0 0 320 100"
      aria-hidden="true"
    >
      <path className="route-line-road" d={line.path} />
      {/* Done in green, as far as the student has really gone; the gold dot is where they are. */}
      <path
        className="route-line-done"
        d={line.path}
        pathLength={1}
        strokeDasharray={`${done} 1`}
      />
      <path
        className="route-line-here"
        d={line.path}
        pathLength={1}
        strokeDasharray="0 2"
        strokeDashoffset={-done}
      />
      <rect
        className="route-line-end"
        x={line.end.x - 9}
        y={line.end.y - 9}
        width="18"
        height="18"
        rx="3"
      />
    </svg>
  );
}

export default function MisRutas({ loaderData }: Route.ComponentProps) {
  const { enrollments, teaches, locale, platformOrigin, newEnrollment } = loaderData;
  // The dot arrives once: a reload of this page isn't the first visit.
  useEffect(() => {
    if (newEnrollment) {
      window.history.replaceState(null, "", "/mis-rutas");
    }
  }, [newEnrollment]);
  const words = APP_PAGES_TEXT[locale];
  const catalog = `${platformOrigin}/${locale}/explorar`;
  return (
    <>
      <header className="app-mode-bar">
        <nav aria-label={words.modeLabel}>
          <ul className="app-modes">
            <li>
              <a className="app-mode" aria-current="page" href="/mis-rutas">
                {words.learn}
              </a>
            </li>
            {teaches ? (
              <li>
                <a className="app-mode" href="/studio">
                  {words.teach}
                </a>
              </li>
            ) : null}
          </ul>
        </nav>
      </header>
      <main className="app-page moment">
        <h1 className="app-title">{words.myRoutes}</h1>
        {enrollments.length === 0 ? (
          <EmptyState
            title={words.emptyTitle}
            action={<ButtonLink href={catalog}>{words.exploreRoutes}</ButtonLink>}
          >
            {words.emptyBody}
          </EmptyState>
        ) : (
          <>
            <ul className="my-routes">
              {enrollments.map((enrollment) => (
                <li key={enrollment.enrollmentId} className="my-route">
                  <EnrollmentLine
                    lessons={enrollment.lessonsPerModule}
                    completed={enrollment.completedLessons}
                    seed={enrollment.routeId}
                    isNew={enrollment.enrollmentId === newEnrollment}
                  />
                  <h2 className="route-card-title">
                    {inLocale(enrollment.title, locale, enrollment.sourceLocale)}
                  </h2>
                  <p className="route-card-creator">
                    {filled(CATALOG_TEXT[locale].withCreator, {
                      creator: inLocale(enrollment.creator, locale),
                    })}
                  </p>
                  <ButtonLink
                    href={`/mis-rutas/${enrollment.enrollmentId}`}
                    aria-label={`${words.continue}: ${inLocale(enrollment.title, locale, enrollment.sourceLocale)}`}
                  >
                    {words.continue}
                  </ButtonLink>
                </li>
              ))}
            </ul>
            <a className="text-link" href={catalog}>
              {words.exploreMore}
            </a>
          </>
        )}
      </main>
    </>
  );
}
