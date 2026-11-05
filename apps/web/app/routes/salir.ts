import { data, redirect } from "react-router";
import { askApi, isFromTheApp } from "../app-api.server";
import { pageContext } from "../context";
import type { Route } from "./+types/salir";

// The header's "Salir": a form post, so it works with no script and no link can sign anyone out.

export async function action({ request, context }: Route.ActionArgs) {
  if (!isFromTheApp(request, context)) {
    throw data(null, { status: 404 });
  }
  const { cookies } = await askApi(context, request, "/api/auth/sign-out", {});
  const headers = new Headers();
  for (const cookie of cookies) {
    headers.append("Set-Cookie", cookie);
  }
  return redirect(context.get(pageContext).platformOrigin, { headers });
}

export function loader() {
  throw data(null, { status: 405, headers: { Allow: "POST" } });
}
