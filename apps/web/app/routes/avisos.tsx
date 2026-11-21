import { HUB_TEXT } from "@learning-routes/core/copy/hub";
import { SHELL_TEXT } from "@learning-routes/core/copy/shell";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import { Form, redirect } from "react-router";
import { isFromTheApp, runApiAction } from "../app-api.server";
import { AppHeader } from "../app-pages/app-header";
import { NoticeList } from "../community/notice-list";
import { ownList, ownNotices } from "../shell.server";
import type { Route } from "./+types/avisos";

// Avisos (Platform STEP 23): what happened to what one wrote, newest first.

export async function loader({ request, context }: Route.LoaderArgs) {
  const [list, notices] = await Promise.all([
    ownList(context, request),
    ownNotices(context, request),
  ]);
  if (!list) {
    throw redirect("/sign-in");
  }
  return {
    enrollments: list.enrollments,
    teaches: list.teaches,
    notices,
    now: Date.now(),
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  if (!isFromTheApp(request, context)) {
    throw new Response(null, { status: 403 });
  }
  await runApiAction(context, request, "notification.read", {});
  return null;
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData ? SHELL_TEXT[loaderData.locale].notices : "";
  return [{ title: `${title} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

export default function Avisos({ loaderData }: Route.ComponentProps) {
  const { enrollments, teaches, notices, now, locale } = loaderData;
  const words = { ...SHELL_TEXT[locale], ...HUB_TEXT[locale] };
  return (
    <div className="desk">
      <AppHeader locale={locale} place="notices" teaches={teaches} />
      <main className="app-page hub hub-narrow">
        <div className="hub-card-title">
          <h1 className="app-title">{words.notices}</h1>
          {notices.unread > 0 ? (
            <Form method="post">
              <button type="submit" className="button button-secondary button-small">
                <span className="button-label">{words.markRead}</span>
              </button>
            </Form>
          ) : null}
        </div>
        <section className="hub-card">
          <NoticeList notices={notices.items} enrollments={enrollments} locale={locale} now={now} />
        </section>
      </main>
    </div>
  );
}
