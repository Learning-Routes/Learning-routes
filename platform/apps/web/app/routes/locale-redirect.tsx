import { LOCALES } from "@learning-routes/core/locales";
import { redirect } from "react-router";

// x-default: the source locale's page.
export function loader() {
  const [source] = LOCALES;
  return redirect(`/${source}`);
}
