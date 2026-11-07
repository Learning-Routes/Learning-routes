import { CREATOR_HUB_TEXT } from "@learning-routes/core/copy/creator-hub";
import { CREATOR_PAGE_TEXT } from "@learning-routes/core/copy/creator-page";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import type { LocalizedText } from "@learning-routes/core/localized-text";
import { data, Form, redirect } from "react-router";
import { isFromTheApp, runApiAction } from "../app-api.server";
import { AppHeader } from "../app-pages/app-header";
import "../app-pages/app-pages.css";
import { inLocale } from "../storefront/words";
import { Button } from "../ui/button";
import { Notice, TextLink } from "../ui/parts";
import { Rising } from "../ui/rising";
import { TextField } from "../ui/text-field";
import type { Route } from "./+types/creador-pagina";

// "Editar tu página" (Platform STEP 8 §4). Owners only, and the API checks: name, line, bio and the
// colour of their actions, which core checks against white.

interface Page {
  name: LocalizedText;
  tagline: LocalizedText | null;
  bio: LocalizedText | null;
  brandColor: string | null;
  defaultLocale: string;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const spaceId = new URL(request.url).searchParams.get("espacio") ?? "";
  const answer = await runApiAction<Page>(context, request, "space.get", { spaceId });
  if (answer.status === 401) {
    throw redirect("/sign-in");
  }
  if (!answer.body?.output) {
    throw data(null, { status: 404 });
  }
  return {
    page: answer.body.output,
    spaceId,
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
  };
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta({ loaderData }: Route.MetaArgs) {
  const words = CREATOR_PAGE_TEXT[loaderData?.locale ?? "es"];
  return [{ title: `${words.editTitle} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

export async function action({ request, context }: Route.ActionArgs) {
  if (!isFromTheApp(request, context)) {
    throw data(null, { status: 404 });
  }
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? "").trim();
  const locale = field("pageLocale");
  const inPageLocale = (text: string) => (text ? { [locale]: text } : null);
  const answer = await runApiAction<unknown>(context, request, "space.update", {
    spaceId: field("spaceId"),
    ...(field("name") ? { name: { [locale]: field("name") } } : {}),
    tagline: inPageLocale(field("tagline")),
    bio: inPageLocale(field("bio")),
    brandColor: field("brandColor") || null,
  });
  return {
    saved: answer.body?.ok === true,
    message: (answer.body as { message?: string } | null)?.message ?? null,
  };
}

export default function CreadorPagina({ loaderData, actionData }: Route.ComponentProps) {
  const { page, spaceId, locale } = loaderData;
  const words = { ...CREATOR_HUB_TEXT[locale], ...CREATOR_PAGE_TEXT[locale] };
  const source = page.defaultLocale;
  return (
    <div className="desk opening">
      <AppHeader locale={locale} place="teach" />
      <main className="app-page app-page-narrow">
        <h1 className="app-title depth-1">
          <Rising text={words.editTitle} />
        </h1>
        {actionData?.saved ? <Notice tone="success" title={words.saved} toast /> : null}
        {actionData && !actionData.saved ? (
          <Notice tone="error" title={actionData.message ?? words.colorHint} />
        ) : null}
        <Form method="post" className="app-form">
          <input type="hidden" name="spaceId" value={spaceId} />
          <input type="hidden" name="pageLocale" value={source} />
          <TextField
            label={words.nameLabel}
            name="name"
            defaultValue={inLocale(page.name, locale, source)}
            required
          />
          <TextField
            label={words.taglineLabel}
            name="tagline"
            defaultValue={inLocale(page.tagline, locale, source)}
          />
          <TextField
            label={words.bioLabel}
            name="bio"
            defaultValue={inLocale(page.bio, locale, source)}
          />
          <TextField
            label={words.colorLabel}
            name="brandColor"
            hint={words.colorHint}
            defaultValue={page.brandColor ?? ""}
          />
          <Button type="submit">{words.save}</Button>
        </Form>
        <TextLink href="/creador">{words.title}</TextLink>
      </main>
    </div>
  );
}
