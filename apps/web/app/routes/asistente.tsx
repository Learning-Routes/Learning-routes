import { ASSISTANT_TEXT } from "@learning-routes/core/copy/assistant";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import type { OwnSpace } from "@learning-routes/core/repos/ports";
import geist from "@learning-routes/design-tokens/fonts/Geist-latin.woff2?url";
import { useCallback } from "react";
import { redirect } from "react-router";
import { runApiAction } from "../app-api.server";
import { DemoTransport } from "../studio/session-transport";
import { StudioPage } from "../studio/studio-page";
import "@learning-routes/design-tokens/geist.css";
import "../studio/studio.css";
import type { Route } from "./+types/asistente";

// "Tu asistente" (Platform STEP 10): where a creator builds a route by talking. Until the agent
// lands, the page plays the scripted demo through the same protocol the agent will speak.

export async function loader({ request, context }: Route.LoaderArgs) {
  const owned = await runApiAction<OwnSpace[]>(context, request, "space.list", {});
  if (owned.status === 401) {
    throw redirect("/sign-in");
  }
  return { locale: negotiateLocale(request.headers.get("accept-language"), "es") };
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export const links: Route.LinksFunction = () => [
  { rel: "preload", href: geist, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
];

export function meta({ loaderData }: Route.MetaArgs) {
  const words = ASSISTANT_TEXT[loaderData?.locale ?? "es"];
  return [{ title: `${words.pageTitle} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

const STILL = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function Assistant({ loaderData }: Route.ComponentProps) {
  const connect = useCallback(
    () =>
      new DemoTransport(
        (ms) => new Promise((resolve) => setTimeout(resolve, STILL() ? Math.min(ms, 60) : ms)),
      ),
    [],
  );
  return <StudioPage words={ASSISTANT_TEXT[loaderData.locale]} connect={connect} />;
}
