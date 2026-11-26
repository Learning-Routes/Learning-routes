import { APP_PAGES_TEXT } from "@learning-routes/core/copy/app-pages";
import { CONNECT_TEXT } from "@learning-routes/core/copy/connect";
import { PROFILE_TEXT, type ProfileText } from "@learning-routes/core/copy/profile";
import { BRAND, type LocaleCode, negotiateLocale } from "@learning-routes/core/locales";
import type { OwnSpace } from "@learning-routes/core/repos/connection-ports";
import type { OwnEnrollment } from "@learning-routes/core/repos/own-enrollment";
import { Form, redirect, useNavigation } from "react-router";
import { runApiAction } from "../app-api.server";
import { AppHeader } from "../app-pages/app-header";
import "../app-pages/app-pages.css";
import { CopyLine } from "../app-pages/copy-line";
import "../app-pages/profile.css";
import { pageContext } from "../context";
import { ownList } from "../shell.server";
import { filled, inLocale } from "../storefront/words";
import { Button, ButtonLink } from "../ui/button";
import { Notice, TextLink } from "../ui/parts";
import { RouteCover } from "../ui/route-cover";
import type { Route } from "./+types/perfil";

// One's profile: the name one is known by, how far one has come in each route, and, for whoever
// teaches, their space and the address their assistant connects to. Until now the name could only
// be given from a route's community, progress was spread over two pages, and the assistant's
// address was three pages deep under Enseñar.

export async function loader({ request, context }: Route.LoaderArgs) {
  const [list, spaces] = await Promise.all([
    ownList(context, request),
    runApiAction<OwnSpace[]>(context, request, "space.list", {}),
  ]);
  if (!list) {
    throw redirect("/sign-in");
  }
  const { appOrigin, creatorDomain, platformOrigin } = context.get(pageContext);
  const { protocol } = new URL(appOrigin);
  return {
    enrollments: list.enrollments,
    name: list.name,
    spaces: (spaces.body?.output ?? []).map((space) => ({
      name: space.name,
      address: `${protocol}//${space.slug}.${creatorDomain}`,
    })),
    assistantAddress: `${appOrigin}/mcp`,
    platformOrigin,
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
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

const totalOf = (enrollment: OwnEnrollment) =>
  enrollment.lessonsPerModule.reduce((sum, count) => sum + count, 0);

function RouteProgress({
  enrollment,
  words,
  locale,
}: {
  enrollment: OwnEnrollment;
  words: ProfileText;
  locale: LocaleCode;
}) {
  const total = totalOf(enrollment);
  const title = inLocale(enrollment.title, locale, enrollment.sourceLocale);
  const { place } = enrollment;
  const next = place.title ? inLocale(place.title, locale, enrollment.sourceLocale) : "";
  return (
    <li className="pf-route">
      <RouteCover seed={enrollment.routeId} className="pf-cover" />
      <div className="pf-route-text">
        <h3 className="pf-route-title">{title}</h3>
        <progress
          className="pf-bar"
          max={total || 1}
          value={enrollment.completedLessons}
          aria-label={filled(words.topicsOf, { done: enrollment.completedLessons, total })}
        />
        <p className="pf-meta">
          {filled(words.topicsOf, { done: enrollment.completedLessons, total })}
          {" · "}
          {place.finished || next === ""
            ? words.finished
            : filled(words.nextTopic, { topic: next })}
        </p>
      </div>
      {place.finished ? null : (
        <ButtonLink
          size="small"
          emphasis="secondary"
          href={`/mis-rutas/${enrollment.enrollmentId}/tema/${place.number}`}
        >
          {words.carryOn}
        </ButtonLink>
      )}
    </li>
  );
}

function Teaching({
  spaces,
  address,
  words,
  locale,
}: {
  spaces: Route.ComponentProps["loaderData"]["spaces"];
  address: string;
  words: ProfileText;
  locale: LocaleCode;
}) {
  const connect = CONNECT_TEXT[locale];
  return (
    <section className="pf-card" aria-labelledby="pf-teach">
      <h2 id="pf-teach" className="app-section-title">
        {words.teaching}
      </h2>
      {spaces.map((space) => (
        <p key={space.address} className="pf-space">
          <b>{filled(words.yourSpace, { space: inLocale(space.name, locale) })}</b>
          <TextLink href={space.address}>{words.openPage}</TextLink>
          <TextLink href="/creador">{words.panel}</TextLink>
        </p>
      ))}
      <h3 className="pf-sub">{words.assistant}</h3>
      <p className="app-copy">{words.assistantHelp}</p>
      <CopyLine text={address} label={connect.copyAddress} done={connect.copied} />
      <p className="pf-links">
        <TextLink href="/creador/conecta">{words.howToConnect}</TextLink>
        <TextLink href="/creador/conexiones">{words.connected}</TextLink>
      </p>
    </section>
  );
}

export default function Perfil({ loaderData, actionData }: Route.ComponentProps) {
  const { enrollments, name, spaces, assistantAddress, platformOrigin, locale } = loaderData;
  const words = PROFILE_TEXT[locale];
  const isSending = useNavigation().state !== "idle";
  const done = enrollments.reduce((sum, enrollment) => sum + enrollment.completedLessons, 0);
  return (
    <div className="desk opening">
      <AppHeader locale={locale} place="profile" />
      <main className="app-page app-page-narrow pf">
        <header className="pf-head">
          {name ? (
            <span className="pf-face" aria-hidden="true">
              {name[0]?.toUpperCase()}
            </span>
          ) : null}
          <h1 className="app-title">{name || words.nameless}</h1>
        </header>
        {actionData ? (
          <Notice
            tone={actionData.said === "saved" ? "success" : "error"}
            title={words[actionData.said]}
          />
        ) : null}
        <Form method="post" className="pf-card pf-name">
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
          <p id="pf-name-help" className="pf-meta">
            {words.nameHelp}
          </p>
        </Form>
        <section className="pf-card" aria-labelledby="pf-progress">
          <h2 id="pf-progress" className="app-section-title">
            {words.progress}
          </h2>
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
            <p className="app-copy">
              {words.noRoutes}{" "}
              <TextLink href={`${platformOrigin}/${locale}/explorar`}>{words.explore}</TextLink>
            </p>
          )}
        </section>
        {spaces.length ? (
          <Teaching spaces={spaces} address={assistantAddress} words={words} locale={locale} />
        ) : (
          <p className="pf-card app-copy">
            {words.wantToTeach} <TextLink href="/ser-creador">{words.askToTeach}</TextLink>
          </p>
        )}
        <section className="pf-card" aria-labelledby="pf-account">
          <h2 id="pf-account" className="app-section-title">
            {words.account}
          </h2>
          <form method="post" action="/salir">
            <Button type="submit" size="small" emphasis="secondary">
              {APP_PAGES_TEXT[locale].signOut}
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}
