import { APP_PAGES_TEXT } from "@learning-routes/core/copy/app-pages";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import type { OwnEnrollment } from "@learning-routes/core/repos/ports";
import { data, redirect } from "react-router";
import { runApiAction } from "../app-api.server";
import "../app-pages/app-pages.css";
import { ButtonLink } from "../ui/button";
import type { Route } from "./+types/seguir";

// "Seguir", until Platform STEP 5 builds the map: only for the visitor's own enrollment.

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const answer = await runApiAction<{ enrollments: OwnEnrollment[] }>(
    context,
    request,
    "enrollment.list",
    {},
  );
  if (answer.status === 401) {
    throw redirect("/sign-in");
  }
  const mine = answer.body?.output?.enrollments.some(
    (enrollment) => enrollment.enrollmentId === params.enrollmentId,
  );
  if (!mine) {
    throw data(null, { status: 404 });
  }
  return { locale: negotiateLocale(request.headers.get("accept-language"), "es") };
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta() {
  return [{ title: BRAND }, { name: "robots", content: "noindex" }];
}

export default function Seguir({ loaderData }: Route.ComponentProps) {
  const words = APP_PAGES_TEXT[loaderData.locale];
  return (
    <main className="app-page app-page-narrow">
      <h1 className="app-title">{words.comingTitle}</h1>
      <p className="app-copy">{words.comingBody}</p>
      <ButtonLink href="/mis-rutas">{words.backToMyRoutes}</ButtonLink>
    </main>
  );
}
