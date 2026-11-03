import { APP_PAGES_TEXT } from "@learning-routes/core/copy/app-pages";
import { CATALOG_TEXT } from "@learning-routes/core/copy/catalog";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import type { OwnEnrollment } from "@learning-routes/core/repos/ports";
import { routeLine } from "@learning-routes/route-map/route-line";
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
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
    platformOrigin: context.get(pageContext).platformOrigin,
  };
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData ? APP_PAGES_TEXT[loaderData.locale].myRoutes : "";
  return [{ title: `${title} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

function EnrollmentLine({ lessons, seed }: { lessons: number[]; seed: string }) {
  const line = routeLine(lessons, seed);
  return (
    <svg className="route-line" viewBox="0 0 320 100" aria-hidden="true">
      <path className="route-line-road" d={line.path} />
      <path className="route-line-way route-line-way-accent" d={line.path} />
      <circle
        className="route-line-start route-line-start-accent"
        cx={line.start.x}
        cy={line.start.y}
        r="9"
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
  const { enrollments, teaches, locale, platformOrigin } = loaderData;
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
      <main className="app-page">
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
                  <EnrollmentLine lessons={enrollment.lessonsPerModule} seed={enrollment.routeId} />
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
