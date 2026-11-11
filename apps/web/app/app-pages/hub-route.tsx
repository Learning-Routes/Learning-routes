import { CREATOR_HUB_TEXT } from "@learning-routes/core/copy/creator-hub";
import type { LocaleCode } from "@learning-routes/core/locales";
import type { LocalizedText } from "@learning-routes/core/localized-text";
import { priceInWords } from "../storefront/creator-frame";
import { filled, inLocale } from "../storefront/words";
import { Button } from "../ui/button";
import { Badge, TextLink } from "../ui/parts";
import { RouteFigure } from "../ui/route-figure";
import { TextField } from "../ui/text-field";
import { type HubCreation, HubCreations } from "./hub-creations";

const LINE_BOX = { width: 1200, height: 100 };
const CURRENCIES = ["USD", "EUR", "MXN", "COP", "CRC"];
const MINOR_UNITS = 100;

export interface HubRouteData {
  id: string;
  title: LocalizedText;
  lessons: number[];
  published: boolean;
  address: string;
  revision: number;
  priceMinor: number | null;
  currency: string | null;
  creations: HubCreation[];
}

/** One form, one button: each action works with no script, and the API checks who is asking. */
function ActionForm({
  route,
  intent,
  label,
}: {
  route: HubRouteData;
  intent: string;
  label: string;
}) {
  return (
    <form method="post">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="routeId" value={route.id} />
      <input type="hidden" name="revision" value={route.revision} />
      <Button type="submit" size="small" emphasis="secondary">
        {label}
      </Button>
    </form>
  );
}

function PriceForm({ route, locale }: { route: HubRouteData; locale: LocaleCode }) {
  const words = CREATOR_HUB_TEXT[locale];
  const saved =
    route.priceMinor !== null && route.currency !== null
      ? priceInWords(route.priceMinor, route.currency, locale)
      : null;
  return (
    <details className="hub-price">
      <summary className="text-link">{words.priceTitle}</summary>
      {saved ? <p className="app-fine">{filled(words.priceCurrent, { price: saved })}</p> : null}
      <form method="post" className="hub-price-form">
        <input type="hidden" name="intent" value="price" />
        <input type="hidden" name="routeId" value={route.id} />
        <input type="hidden" name="revision" value={route.revision} />
        <TextField
          label={words.priceLabel}
          name="amount"
          inputMode="decimal"
          defaultValue={route.priceMinor === null ? "" : String(route.priceMinor / MINOR_UNITS)}
          required
        />
        <label className="field">
          <span className="field-label">{words.priceCurrency}</span>
          <select className="admin-select" name="currency" defaultValue={route.currency ?? "USD"}>
            {CURRENCIES.map((currency) => (
              <option key={currency}>{currency}</option>
            ))}
          </select>
        </label>
        <Button type="submit" size="small" emphasis="secondary">
          {words.priceSave}
        </Button>
      </form>
      <p className="app-fine">{words.priceNote}</p>
    </details>
  );
}

export function HubRoute({
  route,
  locale,
  isOwner,
}: {
  route: HubRouteData;
  locale: LocaleCode;
  isOwner: boolean;
}) {
  const words = CREATOR_HUB_TEXT[locale];
  return (
    <li className="my-route hub-route">
      <div>
        <h3 className="my-route-title">{inLocale(route.title, locale)}</h3>
        <div className="hub-route-state">
          <Badge tone={route.published ? "accent" : "neutral"}>
            {route.published ? words.published : words.draft}
          </Badge>
          <TextLink href={`/creador/rutas/${route.id}/vista-previa`}>{words.preview}</TextLink>
          {route.published ? <TextLink href={route.address}>{words.viewPublic}</TextLink> : null}
        </div>
        <div className="hub-route-actions">
          <ActionForm
            route={route}
            intent="publish"
            label={route.published ? words.republish : words.publish}
          />
          {isOwner && route.published ? (
            <ActionForm route={route} intent="catalog" label={words.askCatalog} />
          ) : null}
          {isOwner ? <PriceForm route={route} locale={locale} /> : null}
        </div>
      </div>
      <RouteFigure lessons={route.lessons} seed={route.id} box={LINE_BOX} />
      <HubCreations
        creations={route.creations}
        routeId={route.id}
        revision={route.revision}
        locale={locale}
      />
    </li>
  );
}
