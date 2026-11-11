import { APP_PAGES_TEXT } from "@learning-routes/core/copy/app-pages";
import { CONNECT_TEXT, type ConnectText } from "@learning-routes/core/copy/connect";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import { useEffect } from "react";
import { data, Form, redirect } from "react-router";
import { isFromTheApp, runApiAction } from "../app-api.server";
import { AppHeader } from "../app-pages/app-header";
import "../app-pages/app-pages.css";
import { NoSpaceYet } from "../app-pages/no-space-yet";
import { pageContext } from "../context";
import { filled } from "../storefront/words";
import { Button } from "../ui/button";
import { Notice } from "../ui/parts";
import { Rising } from "../ui/rising";
import type { Route } from "./+types/conectar";

// The consent screen (Platform STEP 5 §2): an assistant asks, on the app's host, and its
// person says yes or no. The client's name and the host its answer goes to are shown as
// they are. The URL holds the request, signed by the OAuth provider, which checks it again.

const NOT_HERE = { status: 404 };
const SCOPE_WORDS = {
  "routes:read": "scopeRead",
  "routes:write": "scopeWrite",
  "routes:publish": "scopePublish",
} as const satisfies Record<string, keyof ConnectText>;

const known = (scope: string): scope is keyof typeof SCOPE_WORDS =>
  Object.hasOwn(SCOPE_WORDS, scope);

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id");
  const returnsTo = URL.parse(url.searchParams.get("redirect_uri") ?? "");
  if (!(clientId && returnsTo && url.searchParams.has("sig"))) {
    throw data(null, NOT_HERE);
  }
  const who = await runApiAction<{ teaches: boolean }>(context, request, "enrollment.list", {});
  if (who.status === 401) {
    throw redirect(`/sign-in${url.search}`);
  }
  const { appOrigin, runtime } = context.get(pageContext);
  const client = await runtime.mcp(
    new Request(
      `${appOrigin}/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
      { headers: { cookie: request.headers.get("cookie") ?? "" } },
    ),
  );
  if (!client.ok) {
    throw data(null, NOT_HERE);
  }
  const { client_name: clientName } = (await client.json()) as { client_name?: string };
  return {
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
    clientName: clientName ?? clientId,
    host: returnsTo.host,
    scopes: (url.searchParams.get("scope") ?? "").split(" ").filter(known),
    teaches: who.body?.ok === true && who.body.output?.teaches === true,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  if (!isFromTheApp(request, context)) {
    throw data(null, NOT_HERE);
  }
  const form = await request.formData();
  const { appOrigin, runtime } = context.get(pageContext);
  const answer = await runtime.mcp(
    new Request(`${appOrigin}/api/auth/oauth2/consent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: appOrigin,
        cookie: request.headers.get("cookie") ?? "",
        "cf-connecting-ip": request.headers.get("cf-connecting-ip") ?? "",
      },
      body: JSON.stringify({
        accept: form.get("answer") === "allow",
        oauth_query: new URL(request.url).search.slice(1),
      }),
    }),
  );
  const body = (await answer.json().catch(() => null)) as { url?: unknown } | null;
  if (!answer.ok || typeof body?.url !== "string") {
    return { refused: true } as const;
  }
  return { url: body.url } as const;
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta() {
  return [{ title: BRAND }, { name: "robots", content: "noindex" }];
}

export default function Conectar({ loaderData, actionData }: Route.ComponentProps) {
  const { locale, clientName, host, scopes, teaches } = loaderData;
  const words = CONNECT_TEXT[locale];
  const goTo = actionData?.url;
  // A script's navigation: the page's form-action keeps a form to this origin, and the
  // client's address, often a loopback one, is another.
  useEffect(() => {
    if (goTo) {
      window.location.assign(goTo);
    }
  }, [goTo]);
  if (!teaches || actionData?.refused) {
    return (
      <div className="desk opening">
        <AppHeader locale={locale} />
        <main className="app-page app-page-narrow">
          <h1 className="app-title">
            <Rising text={filled(words.consentTitle, { client: clientName })} />
          </h1>
          <NoSpaceYet words={words} back={APP_PAGES_TEXT[locale].backToMyRoutes} />
        </main>
      </div>
    );
  }
  return (
    <div className="desk opening">
      <AppHeader locale={locale} />
      <main className="app-page app-page-narrow">
        <h1 className="app-title">
          <Rising text={filled(words.consentTitle, { client: clientName })} />
        </h1>
        {goTo ? (
          <Notice tone="success" title={words.answered} />
        ) : (
          <>
            <p className="app-copy">{words.asksTo}</p>
            {/* Its moment: the two ends, joined by what is allowed. */}
            <ol className="connect-line moment">
              <li className="connect-end">{clientName}</li>
              {scopes.map((scope) => (
                <li key={scope} className="connect-scope">
                  {words[SCOPE_WORDS[scope]]}
                </li>
              ))}
              <li className="connect-end">{filled(words.yourSide, { brand: BRAND })}</li>
            </ol>
            <p className="app-fine">{filled(words.returnsTo, { host })}</p>
            <Form method="post" className="connect-actions">
              <Button type="submit" name="answer" value="allow">
                {words.allow}
              </Button>
              <Button type="submit" name="answer" value="deny" emphasis="secondary">
                {words.deny}
              </Button>
            </Form>
          </>
        )}
      </main>
    </div>
  );
}
