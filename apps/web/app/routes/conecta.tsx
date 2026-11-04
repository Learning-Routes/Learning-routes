import { APP_PAGES_TEXT } from "@learning-routes/core/copy/app-pages";
import { CONNECT_TEXT } from "@learning-routes/core/copy/connect";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import { useState } from "react";
import { redirect } from "react-router";
import { runApiAction } from "../app-api.server";
import "../app-pages/app-pages.css";
import { NoSpaceYet } from "../app-pages/no-space-yet";
import { pageContext } from "../context";
import { Button } from "../ui/button";
import { TextLink } from "../ui/parts";
import type { Route } from "./+types/conecta";

// "Conecta tu asistente", under Enseñar (Platform STEP 5 §5): the server's address, and a
// button that copies it. The steps for each assistant are in docs/mcp.md.

export async function loader({ request, context }: Route.LoaderArgs) {
  const who = await runApiAction<{ teaches: boolean }>(context, request, "enrollment.list", {});
  if (who.status === 401) {
    throw redirect("/sign-in");
  }
  return {
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
    address: `${context.get(pageContext).appOrigin}/mcp`,
    teaches: who.body?.ok === true && who.body.output?.teaches === true,
  };
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData ? CONNECT_TEXT[loaderData.locale].connectAssistant : "";
  return [{ title: `${title} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

export default function Conecta({ loaderData }: Route.ComponentProps) {
  const { locale, address, teaches } = loaderData;
  const words = CONNECT_TEXT[locale];
  const [copied, setCopied] = useState(false);
  return (
    <main className="desk opening app-page app-page-narrow">
      <h1 className="app-title depth-1">{words.connectAssistant}</h1>
      {teaches ? (
        <>
          <p className="app-copy">{words.connectIntro}</p>
          <h2 className="app-section-title">{words.serverAddress}</h2>
          <div className="connect-address">
            <code className="connect-code">{address}</code>
            <Button
              size="small"
              emphasis="secondary"
              type="button"
              onClick={() => navigator.clipboard.writeText(address).then(() => setCopied(true))}
            >
              {copied ? words.copied : words.copyAddress}
            </Button>
          </div>
          <h2 className="app-section-title">{words.inClaudeCode}</h2>
          <code className="connect-code">{`claude mcp add --transport http learning-routes ${address}`}</code>
          <TextLink href="/ensenar/conexiones">{words.seeConnections}</TextLink>
        </>
      ) : (
        <NoSpaceYet words={words} back={APP_PAGES_TEXT[locale].backToMyRoutes} />
      )}
    </main>
  );
}
