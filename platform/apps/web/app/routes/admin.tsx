import { ADMIN_TEXT, type AdminText } from "@learning-routes/core/copy/admin";
import { BRAND, type LocaleCode, negotiateLocale } from "@learning-routes/core/locales";
import type { ApplicationRecord, CatalogQueueItem } from "@learning-routes/core/repos/ports";
import { data } from "react-router";
import { isFromTheApp, runApiAction } from "../app-api.server";
import "../app-pages/app-pages.css";
import { filled, inLocale } from "../storefront/words";
import { Button, ButtonLink } from "../ui/button";
import { EmptyState } from "../ui/parts";
import { TextField } from "../ui/text-field";
import type { Route } from "./+types/admin";

// Admin, minimal, from v2's Operador (Platform STEP 4 §6.4). Operators only: to anyone
// else, signed in or not, this page does not exist. Every decision is an action, so the
// API checks who is asking, and action_log keeps it.

const NOT_HERE = { status: 404 };
const PLACES = [1, 2, 3] as const;

interface Overview {
  applications: ApplicationRecord[];
  listings: CatalogQueueItem[];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const answer = await runApiAction<Overview>(context, request, "admin.overview", {});
  if (!answer.body?.ok || !answer.body.output) {
    throw data(null, NOT_HERE);
  }
  return {
    ...answer.body.output,
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
  };
}

function inputFor(form: FormData) {
  const field = (name: string) => String(form.get(name) ?? "");
  const intent = field("intent");
  if (intent === "application") {
    return ["application.decide", { applicationId: field("id"), status: field("status") }] as const;
  }
  if (intent === "listing") {
    const note = field("note").trim();
    return [
      "catalog.decide",
      { listingId: field("id"), decision: field("decision"), ...(note ? { note } : {}) },
    ] as const;
  }
  if (intent === "feature") {
    const place = field("position");
    return [
      "catalog.feature",
      { listingId: field("id"), position: place === "" ? null : Number(place) },
    ] as const;
  }
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  // A creator's page is the same site: only the app's own origin may post here.
  if (!isFromTheApp(request, context)) {
    throw data(null, NOT_HERE);
  }
  const chosen = inputFor(await request.formData());
  if (chosen === null) {
    throw data(null, NOT_HERE);
  }
  const answer = await runApiAction(context, request, chosen[0], chosen[1]);
  // A place another route holds is the one refusal an operator can cause and fix.
  if (answer.status === 404 || answer.status === 401) {
    throw data(null, NOT_HERE);
  }
  return { ok: answer.body?.ok === true };
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta() {
  return [{ title: `Admin · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

function Invited({ items, words }: { items: ApplicationRecord[]; words: AdminText }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <>
      <h2 className="app-section-title">{words.invitedTitle}</h2>
      <ul className="admin-list">
        {items.map((item) => (
          <li key={item.id} className="admin-item">
            <div className="admin-item-text">
              <p className="admin-name">{item.name}</p>
              <p className="app-fine admin-email">{item.email}</p>
            </div>
            <ButtonLink
              emphasis="secondary"
              size="small"
              href={`/admin/crear-espacio?solicitud=${item.id}`}
            >
              {words.createSpace}
            </ButtonLink>
          </li>
        ))}
      </ul>
    </>
  );
}

function Applications({ items, words }: { items: ApplicationRecord[]; words: AdminText }) {
  if (items.length === 0) {
    return <EmptyState title={words.noApplications} />;
  }
  return (
    <ul className="admin-list">
      {items.map((item) => (
        <li key={item.id} className="admin-item">
          <div className="admin-item-text">
            <p className="admin-name">{item.name}</p>
            <p className="app-copy">{item.teaches}</p>
            <p className="app-fine admin-email">{item.email}</p>
            {item.link ? (
              <a className="text-link" href={item.link} rel="noopener noreferrer nofollow">
                {item.link}
              </a>
            ) : null}
          </div>
          <form method="post" className="admin-actions">
            <input type="hidden" name="intent" value="application" />
            <input type="hidden" name="id" value={item.id} />
            <Button type="submit" name="status" value="invited" emphasis="secondary" size="small">
              {words.markInvited}
            </Button>
            <Button type="submit" name="status" value="declined" emphasis="quiet" size="small">
              {words.decline}
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}

const titled = (item: CatalogQueueItem, locale: LocaleCode) =>
  `${inLocale(item.title, locale, item.sourceLocale)}, ${inLocale(item.creator, locale)}`;

function Requests({
  items,
  words,
  locale,
}: {
  items: CatalogQueueItem[];
  words: AdminText;
  locale: LocaleCode;
}) {
  if (items.length === 0) {
    return <EmptyState title={words.noRequests} />;
  }
  return (
    <ul className="admin-list">
      {items.map((item) => (
        <li key={item.id} className="admin-item">
          <p className="admin-name admin-item-text">{titled(item, locale)}</p>
          <form method="post" className="admin-actions">
            <input type="hidden" name="intent" value="listing" />
            <input type="hidden" name="id" value={item.id} />
            <TextField label={words.noteLabel} name="note" maxLength={1000} />
            <Button type="submit" name="decision" value="approve" size="small">
              {words.approve}
            </Button>
            <Button type="submit" name="decision" value="decline" emphasis="quiet" size="small">
              {words.decline}
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}

function Listed({
  items,
  words,
  locale,
}: {
  items: CatalogQueueItem[];
  words: AdminText;
  locale: LocaleCode;
}) {
  return (
    <ul className="admin-list">
      {items.map((item) => (
        <li key={item.id} className="admin-item">
          <div className="admin-item-text">
            <p className="admin-name">{titled(item, locale)}</p>
            {item.latestVersion !== item.decidedVersion ? (
              <p className="app-fine">{words.changedSinceApproval}</p>
            ) : null}
          </div>
          <form method="post" className="admin-actions">
            <input type="hidden" name="intent" value="feature" />
            <input type="hidden" name="id" value={item.id} />
            <label className="field-label" htmlFor={`place-${item.id}`}>
              {words.landingPlace}
            </label>
            <select
              id={`place-${item.id}`}
              className="field-input admin-select"
              name="position"
              defaultValue={item.featuredPosition ?? ""}
            >
              <option value="">{words.noPlace}</option>
              {PLACES.map((n) => (
                <option key={n} value={n}>
                  {filled(words.place, { n })}
                </option>
              ))}
            </select>
            <Button type="submit" emphasis="secondary" size="small">
              {words.save}
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}

export default function Admin({ loaderData }: Route.ComponentProps) {
  const { applications, listings, locale } = loaderData;
  const words = ADMIN_TEXT[locale];
  const requested = listings.filter((item) => item.status === "requested");
  const approved = listings.filter((item) => item.status === "approved");
  return (
    <main className="app-page admin">
      <div className="admin-head">
        <h1 className="app-title">{words.adminTitle}</h1>
        <ButtonLink size="small" href="/admin/crear-espacio">
          {words.createSpace}
        </ButtonLink>
      </div>
      <Applications items={applications.filter((item) => item.status === "new")} words={words} />
      <Invited items={applications.filter((item) => item.status === "invited")} words={words} />
      <h2 className="app-section-title">{words.catalogRequests}</h2>
      <Requests items={requested} words={words} locale={locale} />
      <h2 className="app-section-title">{words.listedTitle}</h2>
      <Listed items={approved} words={words} locale={locale} />
    </main>
  );
}
