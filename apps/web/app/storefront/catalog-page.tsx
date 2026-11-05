import { CATALOG_TEXT } from "@learning-routes/core/copy/catalog";
import { ROUTE_TOPICS, type RouteTopic, TOPIC_NAMES } from "@learning-routes/core/copy/route-facts";
import type { LocaleCode } from "@learning-routes/core/locales";
import type { PublicRoute } from "@learning-routes/public-read/reads";
import { ButtonLink } from "../ui/button";
import { EmptyState, TextLink } from "../ui/parts";
import { Rising } from "../ui/rising";
import { EnhancementScript } from "./enhancement-script";
import { RouteCard } from "./route-card";
import { PlatformHeader } from "./site-frame";
import { filled } from "./words";

export interface CatalogView {
  locale: LocaleCode;
  appOrigin: string;
  creatorOrigin: (slug: string) => string;
  topic: RouteTopic | null;
  search: string | null;
  page: number;
  routes: PublicRoute[];
  hasNext: boolean;
}

type Filters = Pick<CatalogView, "locale" | "topic" | "search" | "page">;

/** A plain GET link: search, filters and pages all work with no JavaScript. */
export function catalogHref({ locale, topic, search, page }: Filters): string {
  const query = new URLSearchParams();
  if (search) {
    query.set("q", search);
  }
  if (topic) {
    query.set("tema", topic);
  }
  if (page > 1) {
    query.set("pagina", String(page));
  }
  const text = query.toString();
  return `/${locale}/explorar${text ? `?${text}` : ""}`;
}

function TopicFilters({ locale, topic, search }: Pick<CatalogView, "locale" | "topic" | "search">) {
  const words = CATALOG_TEXT[locale];
  const choice = (name: string, value: RouteTopic | null) => (
    <li key={name}>
      <a
        className="catalog-topic"
        aria-current={value === topic ? "true" : undefined}
        href={catalogHref({ locale, search, topic: value, page: 1 })}
      >
        {/* The filled pill slides from the last choice to this one: see the page transition. */}
        {value === topic ? <span className="catalog-topic-pill" aria-hidden="true" /> : null}
        <span className="catalog-topic-name" data-vt={`topic-${value ?? "all"}`}>
          {name}
        </span>
      </a>
    </li>
  );
  return (
    <nav aria-label={words.filterLabel}>
      <ul className="catalog-topics">
        {choice(words.allTopics, null)}
        {ROUTE_TOPICS.map((value) => choice(TOPIC_NAMES[locale][value], value))}
      </ul>
    </nav>
  );
}

function NoRoutes({ view }: { view: CatalogView }) {
  const { locale, appOrigin, search, topic } = view;
  const words = CATALOG_TEXT[locale];
  if (search || topic) {
    const title = search
      ? filled(words.noResults, { search })
      : filled(words.noResultsInTopic, { topic: topic ? TOPIC_NAMES[locale][topic] : "" });
    return (
      <EmptyState
        title={title}
        action={
          <TextLink href={catalogHref({ locale, search: null, topic: null, page: 1 })}>
            {words.clearFilters}
          </TextLink>
        }
      />
    );
  }
  return (
    <EmptyState
      title={words.teachTitle}
      action={<ButtonLink href={`${appOrigin}/ser-creador`}>{words.teachAction}</ButtonLink>}
    >
      {words.teachBody}
    </EmptyState>
  );
}

function Pagination({ view }: { view: CatalogView }) {
  const { locale, search, topic, page, hasNext } = view;
  const words = CATALOG_TEXT[locale];
  if (page === 1 && !hasNext) {
    return null;
  }
  return (
    <nav className="catalog-pages" aria-label={words.paginationLabel}>
      {page > 1 ? (
        <TextLink rel="prev" href={catalogHref({ locale, search, topic, page: page - 1 })}>
          {words.previous}
        </TextLink>
      ) : null}
      {hasNext ? (
        <TextLink rel="next" href={catalogHref({ locale, search, topic, page: page + 1 })}>
          {words.next}
        </TextLink>
      ) : null}
    </nav>
  );
}

export function CatalogPage({ view }: { view: CatalogView }) {
  const { locale, appOrigin, creatorOrigin, topic, search, routes } = view;
  const words = CATALOG_TEXT[locale];
  return (
    <>
      <PlatformHeader locale={locale} appOrigin={appOrigin} />
      {/* A filtered or later page moves what's there, so only the catalog's own address opens. */}
      <main className={`catalog stage moment${topic || search || view.page > 1 ? "" : " opening"}`}>
        <h1 className="catalog-title depth-1">
          <Rising text={words.title} />
        </h1>
        {/* Plain GET: the results are server-rendered, with or without JavaScript. */}
        <search className="settle-1">
          <form className="catalog-search" method="get" action={`/${locale}/explorar`}>
            <label className="catalog-search-label" htmlFor="catalog-q">
              {words.searchLabel}
            </label>
            <input
              id="catalog-q"
              className="field-input catalog-search-input"
              type="search"
              name="q"
              maxLength={80}
              defaultValue={search ?? ""}
              placeholder={words.searchExample}
            />
            {topic ? <input type="hidden" name="tema" value={topic} /> : null}
            <button className="button button-primary button-regular" type="submit">
              <span className="button-label">{words.search}</span>
            </button>
          </form>
        </search>
        <div className="settle-2">
          <TopicFilters locale={locale} topic={topic} search={search} />
        </div>
        <p className="catalog-free settle-3">{words.firstFree}</p>
        {routes.length === 0 ? (
          <NoRoutes view={view} />
        ) : (
          <ul className="catalog-grid">
            {routes.map((route) => (
              // Names the card across pages, so filtering moves it instead of replacing it.
              <li key={route.routeId} data-vt={`route-${route.routeId}`}>
                <RouteCard
                  route={route}
                  locale={locale}
                  href={`${creatorOrigin(route.spaceSlug)}/${route.slug}`}
                />
              </li>
            ))}
          </ul>
        )}
        <Pagination view={view} />
      </main>
      <EnhancementScript page="stage" />
    </>
  );
}
