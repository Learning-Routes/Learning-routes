import type { LessonView } from "@learning-routes/core/content/lesson-view";
import { CREATOR_HUB_TEXT } from "@learning-routes/core/copy/creator-hub";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import type { LocalizedText } from "@learning-routes/core/localized-text";
import { data, redirect } from "react-router";
import { runApiAction } from "../app-api.server";
import { AppHeader } from "../app-pages/app-header";
import "../app-pages/app-pages.css";
import { LessonBlocks } from "../app-pages/lesson-parts";
import "../app-pages/lesson.css";
import { inLocale } from "../storefront/words";
import { lessonPage } from "../surface";
import type { Route } from "./+types/vista-previa";

// A draft, as a student would read it, for those who make it (Platform STEP 8 §3). Nothing a student
// sees changes until it is published; only a member of the space can open this.

interface Preview {
  view: LessonView | null;
  route: { title: LocalizedText; sourceLocale: string };
  outline: { title: LocalizedText; lessons: LocalizedText[] }[];
}

export const handle = lessonPage;

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const wanted = Number(new URL(request.url).searchParams.get("tema"));
  const answer = await runApiAction<Preview>(context, request, "route.preview", {
    routeId: params.routeId,
    ...(Number.isInteger(wanted) && wanted > 0 ? { topic: wanted } : {}),
  });
  if (answer.status === 401) {
    throw redirect("/sign-in");
  }
  if (!answer.body?.output) {
    throw data(null, { status: 404 });
  }
  return {
    ...answer.body.output,
    current: wanted > 0 ? wanted : 1,
    routeId: params.routeId,
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
  };
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta({ loaderData }: Route.MetaArgs) {
  const words = CREATOR_HUB_TEXT[loaderData?.locale ?? "es"];
  return [{ title: `${words.previewBand} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

export default function VistaPrevia({ loaderData }: Route.ComponentProps) {
  const { view, route, outline, current, routeId, locale } = loaderData;
  const words = CREATOR_HUB_TEXT[locale];
  const source = route.sourceLocale;
  let number = 0;
  return (
    <div className="desk opening">
      <AppHeader locale={locale} place="teach" />
      <p className="preview-band" role="status">
        {words.previewBand}
      </p>
      <div className="preview-page">
        <nav className="preview-outline" aria-label={words.previewOutline}>
          <h1 className="app-title">{inLocale(route.title, locale, source)}</h1>
          {outline.map((module, index) => (
            <section key={index}>
              <h2 className="my-route-title">{inLocale(module.title, locale, source)}</h2>
              <ol>
                {module.lessons.map((lesson) => {
                  number += 1;
                  return (
                    <li key={number}>
                      <a
                        className="text-link"
                        aria-current={number === current ? "page" : undefined}
                        href={`/creador/rutas/${routeId}/vista-previa?tema=${number}`}
                      >
                        {inLocale(lesson, locale, source)}
                      </a>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </nav>
        {view ? (
          <article className="lesson">
            <h2 className="lesson-title">{inLocale(view.title, locale, source)}</h2>
            <LessonBlocks
              blocks={view.blocks}
              locale={locale}
              source={source}
              onAllRight={() => undefined}
            />
          </article>
        ) : (
          <p className="app-copy">{words.previewEmpty}</p>
        )}
      </div>
    </div>
  );
}
