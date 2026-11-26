import { CATALOG_TEXT } from "@learning-routes/core/copy/catalog";
import { CONNECT_TEXT } from "@learning-routes/core/copy/connect";
import type { ProfileText } from "@learning-routes/core/copy/profile";
import type { LocaleCode } from "@learning-routes/core/locales";
import type { OwnEnrollment } from "@learning-routes/core/repos/own-enrollment";
import { filled, inLocale } from "../storefront/words";
import { ButtonLink } from "../ui/button";
import { TextLink } from "../ui/parts";
import { ProgressRing, RouteCover } from "../ui/route-cover";
import { RouteFigure } from "../ui/route-figure";
import { CopyLine } from "./copy-line";

// The profile's two halves: how far one has come, drawn on each route's real shape, and, for
// whoever teaches, the way in for their assistant.

export const topicsOf = (enrollment: OwnEnrollment) =>
  enrollment.lessonsPerModule.reduce((sum, count) => sum + count, 0);

export const practiceOf = (enrollment: OwnEnrollment) =>
  `/mis-rutas/${enrollment.enrollmentId}/tema/${enrollment.place.number}`;

// Narrower than the card is wide, so the stations draw large enough to read.
const LINE_BOX = { width: 640, height: 84 };

export function RouteProgress({
  enrollment,
  words,
  locale,
}: {
  enrollment: OwnEnrollment;
  words: ProfileText;
  locale: LocaleCode;
}) {
  const total = topicsOf(enrollment);
  const { place, sourceLocale } = enrollment;
  const here = place.number - 1;
  const count = filled(words.topicsOf, { done: enrollment.completedLessons, total });
  const next = place.title ? inLocale(place.title, locale, sourceLocale) : "";
  return (
    <li className="pf-route">
      <RouteCover seed={enrollment.routeId} className="pf-cover" />
      <div className="pf-route-head">
        <h3 className="pf-route-title">{inLocale(enrollment.title, locale, sourceLocale)}</h3>
        <p className="pf-meta">
          {filled(CATALOG_TEXT[locale].withCreator, {
            creator: inLocale(enrollment.creator, locale),
          })}
        </p>
      </div>
      <ProgressRing share={total ? enrollment.completedLessons / total : 0} label={count} />
      <RouteFigure
        lessons={enrollment.lessonsPerModule}
        seed={enrollment.routeId}
        box={LINE_BOX}
        done={place.finished ? here : here - 1}
        here={place.finished ? -1 : here}
        className="pf-line"
      />
      <p className="pf-meta pf-where">
        <b>{count}</b>
        {place.finished || next === "" ? words.finished : filled(words.nextTopic, { topic: next })}
      </p>
      {place.finished ? null : (
        <ButtonLink size="small" href={practiceOf(enrollment)}>
          {words.carryOn}
        </ButtonLink>
      )}
    </li>
  );
}

export interface ProfileSpace {
  name: string;
  address: string;
}
export interface ProfileClient {
  name: string;
  /** Already written for the reader, or null when it has never been used. */
  lastUsed: string | null;
}

export function Teaching({
  spaces,
  clients,
  address,
  words,
  locale,
}: {
  spaces: ProfileSpace[];
  clients: ProfileClient[];
  address: string;
  words: ProfileText;
  locale: LocaleCode;
}) {
  const connect = CONNECT_TEXT[locale];
  return (
    <section className="pf-card pf-teach" aria-labelledby="pf-teach">
      <h2 id="pf-teach" className="pf-title">
        {words.teaching}
      </h2>
      <ul className="pf-spaces">
        {spaces.map((space) => (
          <li key={space.address}>
            <b>{space.name}</b>
            <TextLink href={space.address}>{new URL(space.address).host}</TextLink>
          </li>
        ))}
      </ul>
      <ButtonLink size="small" emphasis="secondary" href="/creador">
        {words.panel}
      </ButtonLink>
      <div className="pf-plug" id="asistente">
        <h3 className="pf-plug-title">{words.assistant}</h3>
        <CopyLine text={address} label={connect.copyAddress} done={connect.copied} />
        <ol className="pf-steps">
          {words.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <TextLink href="/creador/conecta">{words.howToConnect}</TextLink>
      </div>
      <h3 className="pf-sub">{words.connectedNow}</h3>
      {clients.length ? (
        <ul className="pf-clients">
          {clients.map((client) => (
            <li key={client.name}>
              <b>{client.name}</b>
              <span className="pf-meta">
                {client.lastUsed
                  ? filled(connect.lastUsed, { date: client.lastUsed })
                  : connect.neverUsed}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pf-meta">{connect.noConnections}</p>
      )}
      <TextLink href="/creador/conexiones">{words.connected}</TextLink>
    </section>
  );
}
