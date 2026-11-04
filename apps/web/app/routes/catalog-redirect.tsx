import { LOCALES } from "@learning-routes/core/locales";
import { redirect } from "react-router";

// /explorar: the source locale's catalog, as / is its landing.
export function loader() {
  const [source] = LOCALES;
  return redirect(`/${source}/explorar`);
}
