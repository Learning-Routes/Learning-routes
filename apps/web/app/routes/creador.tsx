import { CONNECT_TEXT } from "@learning-routes/core/copy/connect";
import { CREATOR_HUB_TEXT } from "@learning-routes/core/copy/creator-hub";
import { BRAND, type LocaleCode, negotiateLocale } from "@learning-routes/core/locales";
import type { OwnSpace, RouteDraft, RouteSummary } from "@learning-routes/core/repos/ports";
import { type RouterContextProvider, redirect } from "react-router";
import { runApiAction } from "../app-api.server";
import { AppHeader } from "../app-pages/app-header";
import "../app-pages/app-pages.css";
import { CopyLine } from "../app-pages/copy-line";
import { pageContext } from "../context";
import { inLocale } from "../storefront/words";
import { ButtonLink } from "../ui/button";
import { Badge, Card, EmptyState } from "../ui/parts";
import { Rising } from "../ui/rising";
import { RouteFigure } from "../ui/route-figure";
import type { Route } from "./+types/creador";

// "Enseñar" (Platform STEP 7), the desk's hub for someone who teaches: each space, its public
// address, its routes with their real lines, and the way to the assistant.

const LINE_BOX = { width: 1200, height: 100 };

async function routesOf(
  context: Readonly<RouterContextProvider>,
  request: Request,
  spaceId: string,
  address: string,
) {
  const listed = await runApiAction<RouteSummary[]>(context, request, "route.list", { spaceId });
  return Promise.all(
    (listed.body?.output ?? []).map(async (route) => {
      const draft = await runApiAction<RouteDraft>(context, request, "route.get", {
        routeId: route.id,
      });
      const modules = draft.body?.output?.modules ?? [];
      const lessons = draft.body?.output?.lessons ?? [];
      return {
        id: route.id,
        title: route.title,
        lessons: modules.map((module) => lessons.filter((l) => l.moduleId === module.id).length),
        published: route.latestPublishedVersion !== null,
        address: `${address}/${route.slug}`,
      };
    }),
  );
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const owned = await runApiAction<OwnSpace[]>(context, request, "space.list", {});
  if (owned.status === 401) {
    throw redirect("/sign-in");
  }
  const { appOrigin, creatorDomain } = context.get(pageContext);
  const { protocol } = new URL(appOrigin);
  const spaces = await Promise.all(
    (owned.body?.output ?? []).map(async (space) => {
      const address = `${protocol}//${space.slug}.${creatorDomain}`;
      const page = await runApiAction<{ tagline?: Record<string, string> | null }>(
        context,
        request,
        "space.get",
        { spaceId: space.id },
      );
      return {
        id: space.id,
        name: space.name,
        address,
        tagline: page.body?.output?.tagline ?? null,
        routes: await routesOf(context, request, space.id, address),
      };
    }),
  );
  const admin = await runApiAction(context, request, "admin.overview", {});
  return {
    spaces,
    isOperator: admin.body?.ok === true,
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
  };
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta({ loaderData }: Route.MetaArgs) {
  const words = CREATOR_HUB_TEXT[loaderData?.locale ?? "es"];
  return [{ title: `${words.title} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

type Loaded = Route.ComponentProps["loaderData"];

function HubRoute({
  route,
  locale,
}: {
  route: Loaded["spaces"][0]["routes"][0];
  locale: LocaleCode;
}) {
  const words = CREATOR_HUB_TEXT[locale];
  return (
    <li className="my-route hub-route">
      <div>
        <h3 className="my-route-title">{inLocale(route.title, locale)}</h3>
        <p className="hub-route-state">
          <Badge tone={route.published ? "accent" : "neutral"}>
            {route.published ? words.published : words.draft}
          </Badge>
          {route.published ? (
            <a className="text-link" href={route.address}>
              {words.viewPublic}
            </a>
          ) : null}
        </p>
      </div>
      <RouteFigure lessons={route.lessons} seed={route.id} box={LINE_BOX} />
    </li>
  );
}

function HubSpace({ space, locale }: { space: Loaded["spaces"][0]; locale: LocaleCode }) {
  const words = CREATOR_HUB_TEXT[locale];
  const connect = CONNECT_TEXT[locale];
  const tagline = inLocale(space.tagline, locale);
  return (
    <>
      <Card className="hub-space">
        <h2 className="hub-space-name depth-2">{inLocale(space.name, locale)}</h2>
        <p className={tagline ? "app-copy" : "app-fine"}>{tagline || words.noTagline}</p>
        <p className="app-fine hub-space-label">{words.publicPage}</p>
        <CopyLine text={space.address} label={connect.copyAddress} done={connect.copied} />
      </Card>
      <section aria-labelledby={`routes-${space.id}`}>
        <h2 id={`routes-${space.id}`} className="my-all-title depth-2">
          {words.yourRoutes}
        </h2>
        {space.routes.length === 0 ? (
          <EmptyState
            title={words.emptyTitle}
            action={<ButtonLink href="/creador/conecta">{words.emptyAction}</ButtonLink>}
          >
            {words.emptyBody}
          </EmptyState>
        ) : (
          <ul className="my-routes">
            {space.routes.map((route) => (
              <HubRoute key={route.id} route={route} locale={locale} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default function Creador({ loaderData }: Route.ComponentProps) {
  const { spaces, isOperator, locale } = loaderData;
  const words = CREATOR_HUB_TEXT[locale];
  const connect = CONNECT_TEXT[locale];
  return (
    <div className="desk opening">
      <AppHeader locale={locale} place="teach" />
      <main className="app-page hub-page moment">
        <h1 className="app-title depth-1">
          <Rising text={words.title} />
        </h1>
        {spaces.length === 0 ? (
          <EmptyState
            title={words.noSpaceTitle}
            action={<ButtonLink href="/ser-creador">{connect.wantToTeach}</ButtonLink>}
          >
            {words.noSpaceBody}
          </EmptyState>
        ) : (
          spaces.map((space) => <HubSpace key={space.id} space={space} locale={locale} />)
        )}
        <nav className="hub-tools" aria-label={words.title}>
          <a className="hub-tool" href="/creador/conecta">
            <span className="hub-tool-name">{connect.connectAssistant}</span>
            <span className="app-fine">{words.connectBody}</span>
          </a>
          <a className="hub-tool" href="/creador/conexiones">
            <span className="hub-tool-name">{connect.connections}</span>
            <span className="app-fine">{words.connectionsBody}</span>
          </a>
          {isOperator ? (
            <a className="hub-tool" href="/admin">
              <span className="hub-tool-name">{words.admin}</span>
              <span className="app-fine">{words.adminBody}</span>
            </a>
          ) : null}
        </nav>
      </main>
    </div>
  );
}
