import { CONNECT_TEXT } from "@learning-routes/core/copy/connect";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import type { ConnectionRecord } from "@learning-routes/core/repos/ports";
import { data, Form, redirect } from "react-router";
import { isFromTheApp, runApiAction } from "../app-api.server";
import { AppHeader } from "../app-pages/app-header";
import "../app-pages/app-pages.css";
import { filled } from "../storefront/words";
import { Button } from "../ui/button";
import { Notice, TextLink } from "../ui/parts";
import { Rising } from "../ui/rising";
import type { Route } from "./+types/conexiones";

// "Conexiones", under Enseñar (Platform STEP 5 §2): each assistant connected to this
// account, and one button that ends it at once.

const NOT_HERE = { status: 404 };

export async function loader({ request, context }: Route.LoaderArgs) {
  const answer = await runApiAction<ConnectionRecord[]>(context, request, "connection.list", {});
  if (answer.status === 401) {
    throw redirect("/sign-in");
  }
  if (!answer.body?.ok || !answer.body.output) {
    throw data(null, NOT_HERE);
  }
  return {
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
    connections: answer.body.output,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  if (!isFromTheApp(request, context)) {
    throw data(null, NOT_HERE);
  }
  const form = await request.formData();
  const answer = await runApiAction(context, request, "connection.revoke", {
    clientId: String(form.get("clientId") ?? ""),
  });
  return { disconnected: answer.body?.ok === true };
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData ? CONNECT_TEXT[loaderData.locale].connections : "";
  return [{ title: `${title} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

export default function Conexiones({ loaderData, actionData }: Route.ComponentProps) {
  const { locale, connections } = loaderData;
  const words = CONNECT_TEXT[locale];
  const scopeWords: Record<string, string> = {
    "routes:read": words.scopeRead,
    "routes:write": words.scopeWrite,
    "routes:publish": words.scopePublish,
  };
  const day = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  return (
    <div className="desk opening">
      <AppHeader locale={locale} place="teach" />
      <main className="app-page app-page-narrow">
        <h1 className="app-title">
          <Rising text={words.connections} />
        </h1>
        {actionData?.disconnected ? (
          <Notice tone="success" title={words.disconnected} toast />
        ) : null}
        {connections.length === 0 ? (
          <p className="app-copy">{words.noConnections}</p>
        ) : (
          <ul className="admin-list">
            {connections.map((connection) => (
              <li key={connection.clientId} className="admin-item">
                <div className="admin-item-text">
                  <p className="admin-name">{connection.clientName}</p>
                  <p className="app-fine">
                    {connection.lastUsedAt
                      ? filled(words.lastUsed, {
                          date: day.format(new Date(connection.lastUsedAt)),
                        })
                      : words.neverUsed}
                  </p>
                  <p className="app-fine">
                    {connection.scopes.flatMap((scope) => scopeWords[scope] ?? []).join(", ")}
                  </p>
                </div>
                <Form method="post">
                  <input type="hidden" name="clientId" value={connection.clientId} />
                  <Button
                    type="submit"
                    size="small"
                    emphasis="secondary"
                    aria-label={`${words.disconnect}: ${connection.clientName}`}
                  >
                    {words.disconnect}
                  </Button>
                </Form>
              </li>
            ))}
          </ul>
        )}
        <TextLink href="/creador/conecta">{words.connectAssistant}</TextLink>
        <TextLink href="/creador">{words.backToTeach}</TextLink>
      </main>
    </div>
  );
}
