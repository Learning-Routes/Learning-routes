import { CONNECT_TEXT } from "@learning-routes/core/copy/connect";
import { CREATOR_HUB_TEXT } from "@learning-routes/core/copy/creator-hub";
import { BRAND, type LocaleCode, negotiateLocale } from "@learning-routes/core/locales";
import type { OwnSpace, RouteDraft, RouteSummary } from "@learning-routes/core/repos/ports";
import { data, type RouterContextProvider, redirect } from "react-router";
import { isFromTheApp, runApiAction } from "../app-api.server";
import { AppHeader } from "../app-pages/app-header";
import "../app-pages/app-pages.css";
import { CopyLine } from "../app-pages/copy-line";
import { HubRoute } from "../app-pages/hub-route";
import { pageContext } from "../context";
import { inLocale } from "../storefront/words";
import { ButtonLink } from "../ui/button";
import { Card, EmptyState, Notice, TextLink } from "../ui/parts";
import { Rising } from "../ui/rising";
import type { Route } from "./+types/creador";

// "Enseñar" (Platform STEP 7), the desk's hub for someone who teaches: each space, its public
// address, its routes with their real lines, and the way to the assistant.

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
        revision: route.revision,
        priceMinor: draft.body?.output?.route.priceMinor ?? null,
        currency: draft.body?.output?.route.currency ?? null,
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
        role: space.role,
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

const MINOR_UNITS = 100;
const AMOUNT = /^\d{1,9}(?:[.,]\d{1,2})?$/;

/** The hub's forms: each one action, which the API checks. */
export async function action({ request, context }: Route.ActionArgs) {
  if (!isFromTheApp(request, context)) {
    throw data(null, { status: 404 });
  }
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? "");
  const routeId = field("routeId");
  const expectedRevision = Number(field("revision"));
  const intent = field("intent");
  if (intent === "publish") {
    const answer = await runApiAction(context, request, "route.publish", {
      routeId,
      expectedRevision,
    });
    return { notice: answer.body?.ok ? "published_ok" : "publishFailed" } as const;
  }
  if (intent === "catalog") {
    const answer = await runApiAction(context, request, "catalog.request", { routeId });
    return { notice: answer.body?.ok ? "catalogAsked" : "catalogRefused" } as const;
  }
  if (intent === "price" && AMOUNT.test(field("amount"))) {
    const priceMinor = Math.round(Number(field("amount").replace(",", ".")) * MINOR_UNITS);
    const answer = await runApiAction(context, request, "route.set_price", {
      routeId,
      expectedRevision,
      priceMinor,
      currency: field("currency"),
    });
    return { notice: answer.body?.ok ? "priceSaved" : "publishFailed" } as const;
  }
  throw data(null, { status: 400 });
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta({ loaderData }: Route.MetaArgs) {
  const words = CREATOR_HUB_TEXT[loaderData?.locale ?? "es"];
  return [{ title: `${words.title} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

type Loaded = Route.ComponentProps["loaderData"];

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
        {space.role === "owner" ? (
          <TextLink href={`/creador/pagina?espacio=${space.id}`}>{words.editPage}</TextLink>
        ) : null}
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
            <ol className="hub-steps">
              {words.emptySteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </EmptyState>
        ) : (
          <ul className="my-routes">
            {space.routes.map((route) => (
              <HubRoute
                key={route.id}
                route={route}
                locale={locale}
                isOwner={space.role === "owner"}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default function Creador({ loaderData, actionData }: Route.ComponentProps) {
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
        {actionData ? <Notice tone="info" title={words[actionData.notice]} /> : null}
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
