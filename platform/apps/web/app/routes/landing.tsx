import { isLocale } from "@learning-routes/core/locales";
import { data } from "react-router";
import { alternates } from "../alternates";
import { storefront } from "../surface";
import type { Route } from "./+types/landing";

export const handle = storefront;

// Per locale; a locale gets a page only once it has text.
export const COPY = {
  es: { line: "Lo que sabes, convertido en una ruta." },
} as const;
type WithText = keyof typeof COPY;
const WITH_TEXT = Object.keys(COPY) as WithText[];

export function loader({ params, request }: Route.LoaderArgs) {
  const lang = params.lang;
  if (!(isLocale(lang) && Object.hasOwn(COPY, lang))) throw data(null, { status: 404 });
  return { lang: lang as WithText, origin: new URL(request.url).origin };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [];
  return [
    { title: "Learning Routes" },
    { name: "description", content: COPY[loaderData.lang].line },
    ...alternates(loaderData.origin, WITH_TEXT, (locale) => `/${locale}`),
  ];
}

export default function Landing({ loaderData }: Route.ComponentProps) {
  return (
    <main className="home">
      <h1>Learning Routes</h1>
      <p>{COPY[loaderData.lang].line}</p>
    </main>
  );
}
