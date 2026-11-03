import { APP_PAGES_TEXT } from "@learning-routes/core/copy/app-pages";
import { BRAND, type LocaleCode, negotiateLocale } from "@learning-routes/core/locales";
import type { LocalizedText } from "@learning-routes/core/localized-text";
import { data, redirect } from "react-router";
import {
  askApi,
  cookieHeaders,
  isFromTheApp,
  isOurOwnNavigation,
  runApiAction,
} from "../app-api.server";
import "../app-pages/app-pages.css";
import { pageContext } from "../context";
import { SignInFlow } from "../sign-in/flow";
import "../sign-in/sign-in.css";
import { filled, inLocale } from "../storefront/words";
import { ButtonLink } from "../ui/button";
import { Notice } from "../ui/parts";
import type { Route } from "./+types/empezar";

// "Empezar gratis" (Platform STEP 4 §6.1). The link carries a route's id and nothing else;
// the rest is resolved here, on the server. Enrolling on a GET is only for a visitor who
// came from our own sites: anyone else's link gets a button to press instead, so another
// site cannot enroll a signed-in person by sending them here.

const SIGN_IN = "/sign-in";
const MY_ROUTES = "/mis-rutas";

interface Preview {
  title: LocalizedText;
  creator: LocalizedText;
  sourceLocale: string;
  isOpen: boolean;
}

type Args = Pick<Route.LoaderArgs, "request" | "context">;

async function enroll({ request, context }: Args, routeId: string) {
  const enrolled = await runApiAction(context, request, "enrollment.create", { routeId });
  if (enrolled.status === 401) {
    return redirect(SIGN_IN);
  }
  if (enrolled.body?.ok) {
    const { enrollmentId } = enrolled.body.output as { enrollmentId: string };
    return redirect(`${MY_ROUTES}?nueva=${encodeURIComponent(enrollmentId)}`, {
      headers: cookieHeaders(enrolled.cookies),
    });
  }
  return null;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const locale = negotiateLocale(request.headers.get("accept-language"), "es");
  const { platformOrigin } = context.get(pageContext);
  const unavailable = { view: "unavailable", locale, platformOrigin } as const;
  const routeId = new URL(request.url).searchParams.get("ruta") ?? "";
  const preview = await askApi<Preview>(
    context,
    request,
    `/api/start/preview?ruta=${encodeURIComponent(routeId)}`,
  );
  if (preview.status !== 200 || preview.body === null || !preview.body.isOpen) {
    return unavailable;
  }
  const route = {
    title: inLocale(preview.body.title, locale, preview.body.sourceLocale),
    creator: inLocale(preview.body.creator, locale),
  };
  const session = await askApi<object>(context, request, "/api/auth/get-session");
  if (session.body === null) {
    const intent = await askApi(context, request, "/api/start/intent", { routeId });
    return data({ view: "sign-in", locale, route } as const, {
      headers: cookieHeaders(intent.cookies),
    });
  }
  if (!isOurOwnNavigation(request, context)) {
    return { view: "confirm", locale, route } as const;
  }
  return (await enroll({ request, context }, routeId)) ?? unavailable;
}

export async function action({ request, context }: Route.ActionArgs) {
  if (!isFromTheApp(request, context)) {
    throw data(null, { status: 403 });
  }
  const routeId = new URL(request.url).searchParams.get("ruta") ?? "";
  const outcome = await enroll({ request, context }, routeId);
  if (outcome === null) {
    throw data(null, { status: 404 });
  }
  return outcome;
}

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => {
  const passed = new Headers(loaderHeaders);
  passed.set("Cache-Control", "no-store");
  return passed;
};

export function meta() {
  return [{ title: BRAND }, { name: "robots", content: "noindex" }];
}

function Unavailable({ locale, origin }: { locale: LocaleCode; origin: string }) {
  const words = APP_PAGES_TEXT[locale];
  return (
    <main className="app-page app-page-narrow">
      <Notice tone="info" title={words.unavailableTitle}>
        {words.unavailableBody}
      </Notice>
      <ButtonLink href={`${origin}/${locale}/explorar`}>{words.seeRoutes}</ButtonLink>
    </main>
  );
}

export default function Empezar({ loaderData }: Route.ComponentProps) {
  const { locale } = loaderData;
  const words = APP_PAGES_TEXT[locale];
  if (loaderData.view === "unavailable") {
    return <Unavailable locale={locale} origin={loaderData.platformOrigin} />;
  }
  const { route } = loaderData;
  const joining = filled(words.joining, { route: route.title });
  const body = filled(words.joiningBody, { creator: route.creator });
  if (loaderData.view === "sign-in") {
    return <SignInFlow locale={locale} notice={null} title={joining} intro={body} />;
  }
  return (
    <main className="app-page app-page-narrow">
      <h1 className="app-title">{joining}</h1>
      <form method="post">
        <button className="button button-primary button-regular" type="submit">
          <span className="button-label">{words.confirmStart}</span>
        </button>
      </form>
    </main>
  );
}
