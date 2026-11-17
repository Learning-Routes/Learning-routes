import { negotiateLocale } from "@learning-routes/core/locales";
import { Outlet } from "react-router";
import "../app-pages/shell.css";
import { ownList, ownNotices } from "../shell.server";
import type { Route } from "./+types/app-shell";

// The app's frame (Platform STEP 23): every signed-in page sits inside it, and its side panel
// shows the same things everywhere. It only loads; each page still draws its own header, with
// what this returns.

export async function loader({ request, context }: Route.LoaderArgs) {
  const [list, notices] = await Promise.all([
    ownList(context, request),
    ownNotices(context, request),
  ]);
  return {
    name: list?.name ?? "",
    teaches: list?.teaches ?? false,
    enrollments: list?.enrollments ?? [],
    unread: notices.unread,
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
  };
}

export type ShellData = Awaited<ReturnType<typeof loader>>;

export default function AppShell() {
  return <Outlet />;
}
