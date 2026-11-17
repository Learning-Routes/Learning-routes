import { COMMUNITY_TEXT } from "@learning-routes/core/copy/community";
import { HUB_TEXT } from "@learning-routes/core/copy/hub";
import { SHELL_TEXT } from "@learning-routes/core/copy/shell";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import type { FeedItem } from "@learning-routes/core/repos/community-ports";
import { redirect } from "react-router";
import { runApiAction } from "../app-api.server";
import { AppHeader } from "../app-pages/app-header";
import { ago, Face } from "../community/post";
import { ownList } from "../shell.server";
import { filled, inLocale } from "../storefront/words";
import { RouteCover } from "../ui/route-cover";
import type { Route } from "./+types/comunidad";

// Comunidad (Platform STEP 23): everything asked and shared in the routes one studies, in one
// place, and the door to each route's own conversation.

export async function loader({ request, context }: Route.LoaderArgs) {
  const list = await ownList(context, request);
  if (!list) {
    throw redirect("/sign-in");
  }
  const feed = await runApiAction<{ items: FeedItem[] }>(context, request, "community.feed", {
    limit: 30,
  }).catch(() => null);
  return {
    enrollments: list.enrollments,
    teaches: list.teaches,
    feed: (feed?.body?.output?.items ?? []).filter((item) => !item.isDeleted && item.body),
    now: Date.now(),
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
  };
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData ? SHELL_TEXT[loaderData.locale].community : "";
  return [{ title: `${title} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

export default function Comunidad({ loaderData }: Route.ComponentProps) {
  const { enrollments, teaches, feed, now, locale } = loaderData;
  const words = { ...COMMUNITY_TEXT[locale], ...SHELL_TEXT[locale], ...HUB_TEXT[locale] };
  const kinds = { question: words.kindQuestion, win: words.kindWin, note: words.kindNote };
  return (
    <div className="desk">
      <AppHeader locale={locale} place="community" teaches={teaches} />
      <main className="app-page hub">
        <h1 className="app-title">{words.community}</h1>
        <div className="hub-row">
          <section aria-labelledby="hub-feed">
            <h2 id="hub-feed" className="hub-card-title">
              {words.feedTitle}
            </h2>
            {feed.length === 0 ? <p className="hub-card hub-quiet">{words.feedEmpty}</p> : null}
            <ul className="hub-feed">
              {feed.map((item) => {
                const enrollment = enrollments.find((one) => one.routeId === item.routeId);
                const route = item.routeTitle ? inLocale(item.routeTitle, locale) : "";
                const body = (
                  <>
                    <span className="hub-feed-by">
                      <Face name={item.authorName} />
                      <b>{item.authorName || words.someone}</b>
                      <span>
                        {`${route ? `${filled(words.inRoute, { route })}, ` : ""}${ago(item.createdAt, now, locale, words.now)}`}
                      </span>
                    </span>
                    {item.kind && item.kind !== "milestone" ? (
                      <span className={`cm-kind cm-kind-${item.kind}`}>{kinds[item.kind]}</span>
                    ) : null}
                    <span className="hub-feed-text">{item.body}</span>
                  </>
                );
                return (
                  <li key={item.id} className="hub-card">
                    {enrollment ? (
                      <a href={`/comunidad/${enrollment.enrollmentId}#p-${item.id}`}>{body}</a>
                    ) : (
                      <div>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="hub-card" aria-labelledby="hub-rooms">
            <h2 id="hub-rooms" className="hub-card-title">
              {words.yourCommunities}
            </h2>
            <ul className="hub-rooms">
              {enrollments.map((enrollment) => {
                const title = inLocale(enrollment.title, locale, enrollment.sourceLocale);
                return (
                  <li key={enrollment.enrollmentId}>
                    <a href={`/comunidad/${enrollment.enrollmentId}`}>
                      <RouteCover
                        seed={enrollment.routeId}
                        title={title}
                        className="hub-room-cover"
                      />
                      <b>{title}</b>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
