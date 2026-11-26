import { APP_PAGES_TEXT } from "@learning-routes/core/copy/app-pages";
import { PROFILE_TEXT, type ProfileText } from "@learning-routes/core/copy/profile";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import type { ConnectionRecord, OwnSpace } from "@learning-routes/core/repos/connection-ports";
import { Form, redirect, useNavigation } from "react-router";
import { runApiAction } from "../app-api.server";
import { AppHeader } from "../app-pages/app-header";
import "../app-pages/app-pages.css";
import "../app-pages/profile.css";
import { practiceOf, RouteProgress, Teaching, topicsOf } from "../app-pages/profile-parts";
import { pageContext } from "../context";
import { ownList } from "../shell.server";
import { filled, inLocale } from "../storefront/words";
import { Button, ButtonLink } from "../ui/button";
import { Notice } from "../ui/parts";
import { RouteCover } from "../ui/route-cover";
import type { Route } from "./+types/perfil";

// One's profile: the name one is known by, how far one has come in each route, and, for whoever
// teaches, their space and the address their assistant connects to. Until now the name could only
// be given from a route's community, progress was spread over two pages, and the assistant's
// address was three pages deep under Enseñar.

export async function loader({ request, context }: Route.LoaderArgs) {
  const [list, spaces, clients] = await Promise.all([
    ownList(context, request),
    runApiAction<OwnSpace[]>(context, request, "space.list", {}),
    runApiAction<ConnectionRecord[]>(context, request, "connection.list", {}),
  ]);
  if (!list) {
    throw redirect("/sign-in");
  }
  const { appOrigin, creatorDomain, platformOrigin } = context.get(pageContext);
  const { protocol } = new URL(appOrigin);
  const locale = negotiateLocale(request.headers.get("accept-language"), "es");
  // Written here, once: a date written again in the browser could land on another day.
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" });
  return {
    enrollments: list.enrollments,
    name: list.name,
    spaces: (spaces.body?.output ?? []).map((space) => ({
      name: inLocale(space.name, locale),
      address: `${protocol}//${space.slug}.${creatorDomain}`,
    })),
    clients: (clients.body?.output ?? []).map((client) => ({
      name: client.clientName,
      lastUsed: client.lastUsedAt ? day.format(new Date(client.lastUsedAt)) : null,
    })),
    assistantAddress: `${appOrigin}/mcp`,
    platformOrigin,
    locale,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  if (name === "") {
    return { said: "failed" as const };
  }
  const answer = await runApiAction(context, request, "profile.update", { displayName: name });
  if (answer.status === 401) {
    throw redirect("/sign-in");
  }
  return { said: answer.body?.ok ? ("saved" as const) : ("failed" as const) };
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData ? PROFILE_TEXT[loaderData.locale].title : "";
  return [{ title: `${title} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

function NameForm({
  name,
  words,
  isSending,
}: {
  name: string;
  words: ProfileText;
  isSending: boolean;
}) {
  return (
    <Form method="post" className="pf-form">
      <label htmlFor="pf-name">{words.nameLabel}</label>
      <input
        id="pf-name"
        name="name"
        className="pf-input"
        defaultValue={name}
        required
        maxLength={60}
        autoComplete="name"
        aria-describedby="pf-name-help"
      />
      <Button type="submit" size="small" disabled={isSending}>
        {words.save}
      </Button>
      <p id="pf-name-help">{words.nameHelp}</p>
    </Form>
  );
}

const RING = 2 * Math.PI * 46;

export default function Perfil({ loaderData, actionData }: Route.ComponentProps) {
  const { enrollments, name, spaces, clients, assistantAddress, platformOrigin, locale } =
    loaderData;
  const words = PROFILE_TEXT[locale];
  const isSending = useNavigation().state !== "idle";
  const done = enrollments.reduce((sum, enrollment) => sum + enrollment.completedLessons, 0);
  const total = enrollments.reduce((sum, enrollment) => sum + topicsOf(enrollment), 0);
  const current = enrollments.find((enrollment) => !enrollment.place.finished);
  const scene = current ?? enrollments[0];
  return (
    <div className="desk opening">
      <AppHeader locale={locale} place="profile" />
      <main className="app-page pf">
        <header className="pf-hero">
          {scene ? <RouteCover seed={scene.routeId} className="pf-scene" /> : null}
          <span className="pf-ring" role="img" aria-label={filled(words.topicsOf, { done, total })}>
            <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
              <circle className="pf-ring-track" cx="50" cy="50" r="46" />
              <circle
                className="pf-ring-done"
                cx="50"
                cy="50"
                r="46"
                strokeDasharray={`${total ? (done / total) * RING : 0} ${RING}`}
                transform="rotate(-90 50 50)"
              />
            </svg>
            <b aria-hidden="true">{name[0]?.toUpperCase()}</b>
          </span>
          <div className="pf-who settle-2">
            <h1 className="pf-name">{name || words.nameless}</h1>
            <dl className="pf-stats">
              <div>
                <dt>{words.routes}</dt>
                <dd>{enrollments.length}</dd>
              </div>
              <div>
                <dt>{words.topicsDone}</dt>
                <dd>{done}</dd>
              </div>
            </dl>
          </div>
          <div className="pf-go settle-3">
            {current ? <ButtonLink href={practiceOf(current)}>{words.carryOn}</ButtonLink> : null}
            {spaces.length ? (
              <a className="pf-jump" href="#asistente">
                {words.assistant}
              </a>
            ) : null}
          </div>
          {name ? (
            <details className="pf-rename settle-4">
              <summary>{words.changeName}</summary>
              <NameForm name={name} words={words} isSending={isSending} />
            </details>
          ) : (
            <NameForm name={name} words={words} isSending={isSending} />
          )}
        </header>
        {actionData ? (
          <Notice
            tone={actionData.said === "saved" ? "success" : "error"}
            title={words[actionData.said]}
          />
        ) : null}
        <section className="pf-main" aria-labelledby="pf-progress">
          <h2 id="pf-progress" className="pf-title">
            {words.progress}
          </h2>
          {enrollments.length ? (
            <ul className="pf-routes">
              {enrollments.map((enrollment) => (
                <RouteProgress
                  key={enrollment.enrollmentId}
                  enrollment={enrollment}
                  words={words}
                  locale={locale}
                />
              ))}
            </ul>
          ) : (
            <div className="pf-card pf-empty">
              <p className="app-copy">{words.noRoutes}</p>
              <ButtonLink href={`${platformOrigin}/${locale}/explorar`}>{words.explore}</ButtonLink>
            </div>
          )}
        </section>
        <div className="pf-side">
          {spaces.length ? (
            <Teaching
              spaces={spaces}
              clients={clients}
              address={assistantAddress}
              words={words}
              locale={locale}
            />
          ) : (
            <section className="pf-card pf-invite">
              <p className="app-copy">{words.wantToTeach}</p>
              <ButtonLink size="small" emphasis="secondary" href="/ser-creador">
                {words.askToTeach}
              </ButtonLink>
            </section>
          )}
          <section className="pf-card pf-account" aria-labelledby="pf-account">
            <h2 id="pf-account" className="pf-title">
              {words.account}
            </h2>
            <form method="post" action="/salir">
              <Button type="submit" size="small" emphasis="secondary">
                {APP_PAGES_TEXT[locale].signOut}
              </Button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
