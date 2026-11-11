import { ASSISTANT_TEXT } from "@learning-routes/core/copy/assistant";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import type { OwnSpace } from "@learning-routes/core/repos/ports";
import { useCallback } from "react";
import { redirect } from "react-router";
import { runApiAction } from "../app-api.server";
import { AgentTransport } from "../studio/agent-transport";
import { DemoTransport } from "../studio/session-transport";
import { StudioPage } from "../studio/studio-page";
import "../studio/studio.css";
import type { Route } from "./+types/asistente";

// "Tu asistente" (Platform STEP 10): where a creator builds a route by talking, with the space's
// agent. ?demo plays the scripted demo instead, through the same protocol.

const EDITORS: readonly string[] = ["owner", "coeditor"];

export async function loader({ request, context }: Route.LoaderArgs) {
  const owned = await runApiAction<OwnSpace[]>(context, request, "space.list", {});
  if (owned.status === 401) {
    throw redirect("/sign-in");
  }
  const isDemo = new URL(request.url).searchParams.has("demo");
  const space = (owned.body?.output ?? []).find((each) => EDITORS.includes(each.role));
  // Someone who edits no space has no assistant: Enseñar tells them how to start.
  if (!(space || isDemo)) {
    throw redirect("/creador");
  }
  return {
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
    spaceId: space?.id ?? null,
    isDemo,
  };
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta({ loaderData }: Route.MetaArgs) {
  const words = ASSISTANT_TEXT[loaderData?.locale ?? "es"];
  return [{ title: `${words.pageTitle} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

const STILL = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function Assistant({ loaderData }: Route.ComponentProps) {
  const { spaceId, isDemo, locale } = loaderData;
  const connect = useCallback(
    () =>
      isDemo || !spaceId
        ? new DemoTransport(
            (ms) => new Promise((resolve) => setTimeout(resolve, STILL() ? Math.min(ms, 60) : ms)),
          )
        : new AgentTransport({ origin: window.location.origin, spaceId, locale }),
    [isDemo, spaceId, locale],
  );
  return <StudioPage words={ASSISTANT_TEXT[loaderData.locale]} connect={connect} />;
}
