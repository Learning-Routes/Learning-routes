import { redirect } from "react-router";
import { COPY } from "./landing";

// x-default: the source locale's page.
export function loader() {
  const [source] = Object.keys(COPY);
  return redirect(`/${source}`);
}
