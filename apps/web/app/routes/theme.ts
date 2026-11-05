import { data, redirect } from "react-router";
import { pageContext } from "../context";
import { isTheme, safeNext, themeCookie } from "../theme";
import type { Route } from "./+types/theme";

// Saves the theme toggle's choice. A form post, so it works with no script.

export async function action({ request, context }: Route.ActionArgs) {
  // A storefront's host never gets a cookie, even if something posts here.
  if (new URL(request.url).origin !== context.get(pageContext).appOrigin) {
    throw data(null, { status: 404 });
  }
  const form = await request.formData();
  const theme = form.get("theme");
  if (!isTheme(theme)) {
    throw data(null, { status: 400 });
  }
  return redirect(safeNext(form.get("next")), {
    status: 303,
    headers: { "Set-Cookie": themeCookie(theme) },
  });
}

export function loader() {
  throw data(null, { status: 405, headers: { Allow: "POST" } });
}
