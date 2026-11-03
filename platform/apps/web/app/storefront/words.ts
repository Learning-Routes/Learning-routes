import { CATALOG_TEXT, LANGUAGE_NAMES } from "@learning-routes/core/copy/catalog";
import type { LocaleCode } from "@learning-routes/core/locales";
import type { LocalizedText } from "@learning-routes/core/localized-text";

// How a storefront page says a route's facts, in words (Platform STEP 4 §3.2).

const AND: Record<LocaleCode, string> = { es: "y", en: "and", pt: "e", fr: "et", it: "e" };
const PLACEHOLDER = /\{(\w+)\}/g;

/** The template with each {name} replaced. */
export function filled(template: string, values: Record<string, string | number>): string {
  return template.replace(PLACEHOLDER, (whole, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : whole,
  );
}

/** A text in this locale, or else in its source locale, or else in whichever it has. */
export function inLocale(
  text: LocalizedText | null | undefined,
  locale: LocaleCode,
  source?: string,
): string {
  if (!text) {
    return "";
  }
  const byLocale = text as Record<string, string | undefined>;
  return (
    byLocale[locale] ?? (source ? byLocale[source] : undefined) ?? Object.values(text)[0] ?? ""
  );
}

function moduleWords(locale: LocaleCode, count: number): string {
  const words = CATALOG_TEXT[locale];
  return filled(count === 1 ? words.moduleOne : words.moduleMany, { n: count });
}

function topicWords(locale: LocaleCode, count: number): string {
  const words = CATALOG_TEXT[locale];
  return filled(count === 1 ? words.topicOne : words.topicMany, { n: count });
}

/** "3 módulos y 14 temas". */
export function moduleAndTopicWords(
  locale: LocaleCode,
  route: { moduleCount: number; lessonCount: number },
): string {
  const [modules, topics] = [
    moduleWords(locale, route.moduleCount),
    topicWords(locale, route.lessonCount),
  ];
  return `${modules} ${AND[locale]} ${topics}`;
}

/** "3 módulos y 14 temas, en español". */
export function routeFacts(
  locale: LocaleCode,
  route: { moduleCount: number; lessonCount: number; sourceLocale: string },
): string {
  return filled(CATALOG_TEXT[locale].facts, {
    modules: moduleWords(locale, route.moduleCount),
    topics: topicWords(locale, route.lessonCount),
    language: LANGUAGE_NAMES[locale][route.sourceLocale as LocaleCode] ?? route.sourceLocale,
  });
}
