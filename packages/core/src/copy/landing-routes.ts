import type { LocaleCode } from "../locales";
import { HOUSE_ROUTE, type HouseRoute } from "./house-route";

// The landing's example routes (Platform STEP 6 §2): four stretches of the house route, English
// from scratch, with its own modules and topics. Each stretch shows three modules: the first
// with its topics and a review (the map draws five stops there), the second with its four, and
// the third by name. Data only. A locale missing one fails the types.

export type ExampleRouteKey = "start" | "daily" | "people" | "travel";
export const EXAMPLE_ROUTE_KEYS: readonly ExampleRouteKey[] = [
  "start",
  "daily",
  "people",
  "travel",
];

/** The modules each stretch shows, by their place in the route. */
const STRETCHES: Record<ExampleRouteKey, [number, number, number]> = {
  start: [0, 1, 2],
  daily: [3, 4, 5],
  people: [6, 7, 8],
  travel: [9, 5, 4],
};

export interface ExampleRoute {
  tab: string;
  title: string;
  modules: [string, string[]][];
}

function shown(route: HouseRoute, index: number): [string, string[]] {
  const [name, topics] = route.modules[index] ?? ["", null];
  return [name, topics ?? []];
}

/** One example route as the map reads it: its tab, its title, each module's name and topics. */
export function exampleRoute(locale: LocaleCode, key: ExampleRouteKey): ExampleRoute {
  const route = HOUSE_ROUTE[locale];
  const [first, second, third] = STRETCHES[key];
  const [firstName, firstTopics] = shown(route, first);
  const [secondName, secondTopics] = shown(route, second);
  return {
    tab: route.tabs[EXAMPLE_ROUTE_KEYS.indexOf(key)] ?? "",
    title: route.title,
    modules: [
      [firstName, [...firstTopics, route.review, route.exam]],
      [secondName, [...secondTopics, route.exam]],
      [shown(route, third)[0], []],
    ],
  };
}
