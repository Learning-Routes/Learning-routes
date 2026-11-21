import { APP_PAGES_TEXT } from "@learning-routes/core/copy/app-pages";
import { COMMUNITY_TEXT } from "@learning-routes/core/copy/community";
import { HUB_TEXT } from "@learning-routes/core/copy/hub";
import { MY_ROUTES_TEXT } from "@learning-routes/core/copy/my-routes";
import { SHELL_TEXT } from "@learning-routes/core/copy/shell";
import { BRAND, type LocaleCode, negotiateLocale } from "@learning-routes/core/locales";
import type { CommunityItem } from "@learning-routes/core/repos/community-ports";
import type { OwnEnrollment } from "@learning-routes/core/repos/ports";
import { redirect } from "react-router";
import { runApiAction } from "../app-api.server";
import { AppHeader } from "../app-pages/app-header";
import { NoticeList } from "../community/notice-list";
import { ago, Face } from "../community/post";
import { pageContext } from "../context";
import { ownList, ownNotices } from "../shell.server";
import { filled, inLocale } from "../storefront/words";
import { ButtonLink } from "../ui/button";
import { EmptyState } from "../ui/parts";
import { usePreloadRoute } from "../ui/preload-route";
import { RouteCover } from "../ui/route-cover";
import type { Route } from "./+types/inicio";

// Inicio (Platform STEP 23): the one place everything meets. The topic to carry on with, what
// people ask in that route, one's routes and one's notices.

const nextOf = (enrollments: OwnEnrollment[]) =>
  enrollments.find(({ place }) => !place.finished && place.title !== null);

export async function loader({ request, context }: Route.LoaderArgs) {
  const [list, notices] = await Promise.all([
    ownList(context, request),
    ownNotices(context, request),
  ]);
  if (!list) {
    throw redirect("/sign-in");
  }
  const next = nextOf(list.enrollments);
  // The questions of the route one is on. If the community does not answer, the page still does.
  const thread = next
    ? await runApiAction<{ pinned: CommunityItem[]; items: CommunityItem[] }>(
        context,
        request,
        "community.list",
        { routeId: next.routeId, limit: 20 },
      ).catch(() => null)
    : null;
  const posts = thread?.body?.output;
  return {
    ...list,
    notices: notices.items.slice(0, 3),
    questions: [...(posts?.pinned ?? []), ...(posts?.items ?? [])]
      .filter((post) => post.kind === "question" && !post.isDeleted && !post.isHidden)
      .slice(0, 3),
    now: Date.now(),
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
    platformOrigin: context.get(pageContext).platformOrigin,
  };
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData ? SHELL_TEXT[loaderData.locale].home : "";
  return [{ title: `${title} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

const totalOf = (enrollment: OwnEnrollment) =>
  enrollment.lessonsPerModule.reduce((sum, count) => sum + count, 0);

function CarryOn({ enrollment, locale }: { enrollment: OwnEnrollment; locale: LocaleCode }) {
  const words = { ...MY_ROUTES_TEXT[locale], ...SHELL_TEXT[locale], ...HUB_TEXT[locale] };
  const route = inLocale(enrollment.title, locale, enrollment.sourceLocale);
  return (
    <section className="hub-hero" aria-labelledby="hub-hero-title">
      <RouteCover seed={enrollment.routeId} title={route} wide className="hub-hero-cover" />
      <div className="hub-hero-words">
        <p>{`${words.carryOn}, ${filled(words.inRoute, { route })}`}</p>
        <h2 id="hub-hero-title">
          {inLocale(enrollment.place.title, locale, enrollment.sourceLocale)}
        </h2>
        <p>{filled(words.topicOf, { n: enrollment.place.number, total: totalOf(enrollment) })}</p>
        <ButtonLink href={`/mis-rutas/${enrollment.enrollmentId}/tema/${enrollment.place.number}`}>
          {APP_PAGES_TEXT[locale].continue}
        </ButtonLink>
      </div>
    </section>
  );
}

function Questions({
  questions,
  enrollment,
  locale,
  now,
}: {
  questions: CommunityItem[];
  enrollment: OwnEnrollment;
  locale: LocaleCode;
  now: number;
}) {
  const words = { ...COMMUNITY_TEXT[locale], ...SHELL_TEXT[locale], ...HUB_TEXT[locale] };
  const community = `/comunidad/${enrollment.enrollmentId}`;
  return (
    <section className="hub-card" aria-labelledby="hub-questions">
      <h2 id="hub-questions" className="hub-card-title">
        {words.questionsTitle}
        <a className="text-link" href={community}>
          {words.seeAll}
        </a>
      </h2>
      {questions.length === 0 ? <p className="hub-quiet">{words.noQuestions}</p> : null}
      <ul className="hub-questions">
        {questions.map((question) => (
          <li key={question.id}>
            <Face name={question.authorName} />
            <a href={`${community}#p-${question.id}`}>
              <b>{question.body}</b>
              <span>
                {`${question.authorName || words.someone}, ${ago(question.createdAt, now, locale, words.now)}`}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <ButtonLink href={`${community}#preguntar`} emphasis="secondary" size="small">
        {words.ask}
      </ButtonLink>
    </section>
  );
}

function Tile({ enrollment, locale }: { enrollment: OwnEnrollment; locale: LocaleCode }) {
  const title = inLocale(enrollment.title, locale, enrollment.sourceLocale);
  const total = totalOf(enrollment);
  const done = enrollment.place.finished ? total : enrollment.place.number - 1;
  return (
    <li>
      <a className="hub-tile" href={`/mis-rutas/${enrollment.enrollmentId}`}>
        <RouteCover seed={enrollment.routeId} title={title} className="hub-tile-cover" />
        <b>{title}</b>
        <progress className="shell-bar" max={total || 1} value={done} aria-label={title} />
      </a>
    </li>
  );
}

export default function Inicio({ loaderData }: Route.ComponentProps) {
  usePreloadRoute("routes/tema");
  const { enrollments, name, teaches, notices, questions, now, locale, platformOrigin } =
    loaderData;
  const words = {
    ...APP_PAGES_TEXT[locale],
    ...MY_ROUTES_TEXT[locale],
    ...SHELL_TEXT[locale],
    ...HUB_TEXT[locale],
  };
  const next = nextOf(enrollments);
  return (
    <div className="desk opening">
      <AppHeader locale={locale} place="home" teaches={teaches} />
      <main className="app-page hub">
        <h1 className="app-title">{name ? filled(words.hello, { name }) : words.home}</h1>
        {enrollments.length === 0 ? (
          <EmptyState
            title={words.emptyTitle}
            action={
              <ButtonLink href={`${platformOrigin}/${locale}/explorar`}>
                {words.exploreRoutes}
              </ButtonLink>
            }
          >
            {words.emptyBody}
          </EmptyState>
        ) : (
          <>
            {next ? (
              <div className="hub-row">
                <CarryOn enrollment={next} locale={locale} />
                <Questions questions={questions} enrollment={next} locale={locale} now={now} />
              </div>
            ) : null}
            <div className="hub-row">
              <section aria-labelledby="hub-routes">
                <h2 id="hub-routes" className="hub-card-title">
                  {words.yourRoutes}
                  <a className="text-link" href="/mis-rutas">
                    {words.seeAll}
                  </a>
                </h2>
                <ul className="hub-tiles">
                  {enrollments.slice(0, 4).map((enrollment) => (
                    <Tile key={enrollment.enrollmentId} enrollment={enrollment} locale={locale} />
                  ))}
                </ul>
              </section>
              <section className="hub-card" aria-labelledby="hub-notices">
                <h2 id="hub-notices" className="hub-card-title">
                  {words.notices}
                  <a className="text-link" href="/avisos">
                    {words.seeAll}
                  </a>
                </h2>
                <NoticeList notices={notices} enrollments={enrollments} locale={locale} now={now} />
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
