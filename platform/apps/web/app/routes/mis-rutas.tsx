import { APP_PAGES_TEXT } from "@learning-routes/core/copy/app-pages";
import { CATALOG_TEXT } from "@learning-routes/core/copy/catalog";
import { MY_ROUTES_TEXT } from "@learning-routes/core/copy/my-routes";
import { BRAND, type LocaleCode, negotiateLocale } from "@learning-routes/core/locales";
import type { OwnEnrollment } from "@learning-routes/core/repos/ports";
import { useEffect, useState } from "react";
import { redirect } from "react-router";
import { askApi, runApiAction } from "../app-api.server";
import "../app-pages/app-pages.css";
import { pageContext } from "../context";
import { filled, inLocale } from "../storefront/words";
import { ButtonLink } from "../ui/button";
import { EmptyState } from "../ui/parts";
import { Rising } from "../ui/rising";
import { RouteFigure } from "../ui/route-figure";
import { NavLink, SiteHeader } from "../ui/site-header";
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
  // Their own name, when they have one. Accounts made by a sign-in link start without.
  const session = await askApi<{ user?: { name?: string } }>(
    context,
    request,
    "/api/auth/get-session",
  );
  return {
    ...answer.body.output,
    name: session.body?.user?.name?.trim() ?? "",
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

const SEEN_KEY = "lr_arrived";

/** The dot arrives once per enrollment: enrolling is idempotent, so the address alone can't say. */
function useArrivingEnrollment(enrollmentId: string | null) {
  const [arriving, setArriving] = useState<string | null>(null);
  useEffect(() => {
    if (!enrollmentId) {
      return;
    }
    window.history.replaceState(window.history.state, "", "/mis-rutas");
    try {
      const seen: string[] = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
      if (!seen.includes(enrollmentId)) {
        localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, enrollmentId]));
        setArriving(enrollmentId);
      }
    } catch {
      // Storage is off: the dot is simply there, with no arrival.
    }
  }, [enrollmentId]);
  return arriving;
}

const NEXT_BOX = { width: 1200, height: 140 };
const ITEM_BOX = { width: 1200, height: 100 };

/** The student's own line: done in green, and the gold dot where they are. */
function EnrollmentLine({
  enrollment,
  box,
  isNew = false,
}: {
  enrollment: OwnEnrollment;
  box: { width: number; height: number };
  isNew?: boolean;
}) {
  const topic = enrollment.place.number - 1;
  return (
    <RouteFigure
      lessons={enrollment.lessonsPerModule}
      seed={enrollment.routeId}
      box={box}
      done={enrollment.place.finished ? topic : topic - 1}
      here={enrollment.place.finished ? -1 : topic}
      className={isNew ? "my-route-line route-line-new" : "my-route-line"}
    />
  );
}

function topicTotal(enrollment: OwnEnrollment) {
  return enrollment.lessonsPerModule.reduce((sum, count) => sum + count, 0);
}

function CarryOn({
  enrollment,
  locale,
  isNew,
}: {
  enrollment: OwnEnrollment;
  locale: LocaleCode;
  isNew: boolean;
}) {
  const words = MY_ROUTES_TEXT[locale];
  const source = enrollment.sourceLocale;
  return (
    <section className="my-next" aria-labelledby="my-next-title">
      <div className="settle-2">
        <p className="my-next-line">{words.carryOn}</p>
        <h2 id="my-next-title" className="my-next-title depth-2">
          {filled(words.topicTitle, {
            n: enrollment.place.number,
            title: inLocale(enrollment.place.title, locale, source),
          })}
        </h2>
        <p className="my-next-line">
          {`${filled(words.routeWith, {
            route: inLocale(enrollment.title, locale, source),
            creator: inLocale(enrollment.creator, locale),
          })} ${filled(words.onTopic, { n: enrollment.place.number, total: topicTotal(enrollment) })}`}
        </p>
      </div>
      <ButtonLink className="settle-3" href={`/mis-rutas/${enrollment.enrollmentId}`}>
        {APP_PAGES_TEXT[locale].continue}
      </ButtonLink>
      <EnrollmentLine enrollment={enrollment} box={NEXT_BOX} isNew={isNew} />
    </section>
  );
}

function MyRoute({
  enrollment,
  locale,
  isNew,
}: {
  enrollment: OwnEnrollment;
  locale: LocaleCode;
  isNew: boolean;
}) {
  const words = { ...APP_PAGES_TEXT[locale], ...MY_ROUTES_TEXT[locale] };
  const title = inLocale(enrollment.title, locale, enrollment.sourceLocale);
  const { finished, number, title: topic } = enrollment.place;
  const creator = filled(CATALOG_TEXT[locale].withCreator, {
    creator: inLocale(enrollment.creator, locale),
  });
  return (
    <li className="my-route">
      <div>
        <h3 className="my-route-title">{title}</h3>
        <p className="my-route-line-words">
          {`${creator}. `}
          {finished ? (
            <span className="my-route-finished">{words.routeFinished}</span>
          ) : topic ? (
            filled(words.onTopic, { n: number, total: topicTotal(enrollment) })
          ) : null}
        </p>
      </div>
      {finished || topic ? (
        <ButtonLink
          href={`/mis-rutas/${enrollment.enrollmentId}`}
          emphasis={finished ? "secondary" : "primary"}
          size="small"
          aria-label={`${finished ? words.review : words.continue}: ${title}`}
        >
          {finished ? words.review : words.continue}
        </ButtonLink>
      ) : null}
      <EnrollmentLine enrollment={enrollment} box={ITEM_BOX} isNew={isNew} />
    </li>
  );
}

export default function MisRutas({ loaderData }: Route.ComponentProps) {
  const { enrollments, teaches, locale, platformOrigin, newEnrollment, name } = loaderData;
  const arriving = useArrivingEnrollment(newEnrollment);
  const words = { ...APP_PAGES_TEXT[locale], ...MY_ROUTES_TEXT[locale] };
  const catalog = `${platformOrigin}/${locale}/explorar`;
  // A route with no topics yet has nowhere to carry on to.
  const next = enrollments.find(({ place }) => !place.finished && place.title !== null);
  return (
    <div className="desk opening">
      <SiteHeader brand={BRAND} brandHref={`${platformOrigin}/${locale}`} navLabel={words.myRoutes}>
        <a className="nav-link" aria-current="page" href="/mis-rutas">
          {words.myRoutes}
        </a>
        <NavLink href={catalog}>{words.explore}</NavLink>
        {name ? <span className="my-name">{name}</span> : null}
      </SiteHeader>
      <main className="app-page my-page moment">
        <div className="my-top">
          <h1 className="app-title depth-1">
            <Rising text={name ? filled(words.hello, { name }) : words.myRoutes} />
          </h1>
          {teaches ? (
            <nav aria-label={words.modeLabel} className="settle-1">
              <ul className="app-modes">
                <li>
                  <a className="app-mode" aria-current="page" href="/mis-rutas">
                    {words.learn}
                  </a>
                </li>
                <li>
                  <a className="app-mode" href="/studio">
                    {words.teach}
                  </a>
                </li>
              </ul>
            </nav>
          ) : null}
        </div>
        {enrollments.length === 0 ? (
          <EmptyState
            title={words.emptyTitle}
            action={<ButtonLink href={catalog}>{words.exploreRoutes}</ButtonLink>}
          >
            {words.emptyBody}
          </EmptyState>
        ) : (
          <>
            {next ? (
              <CarryOn enrollment={next} locale={locale} isNew={next.enrollmentId === arriving} />
            ) : null}
            <section aria-labelledby="my-all" className="settle-4">
              <h2 id="my-all" className="my-all-title depth-2">
                {words.yourRoutes}
              </h2>
              <ul className="my-routes">
                {enrollments.map((enrollment) => (
                  <MyRoute
                    key={enrollment.enrollmentId}
                    enrollment={enrollment}
                    locale={locale}
                    isNew={enrollment.enrollmentId === arriving}
                  />
                ))}
              </ul>
            </section>
            <a className="text-link" href={catalog}>
              {words.exploreMore}
            </a>
          </>
        )}
      </main>
    </div>
  );
}
