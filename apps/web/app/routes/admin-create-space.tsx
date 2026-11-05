import { ADMIN_TEXT, type AdminText } from "@learning-routes/core/copy/admin";
import { BRAND, type LocaleCode, negotiateLocale } from "@learning-routes/core/locales";
import type { ApplicationRecord, CatalogQueueItem } from "@learning-routes/core/repos/ports";
import { data } from "react-router";
import { isFromTheApp, runApiAction } from "../app-api.server";
import { AppHeader } from "../app-pages/app-header";
import "../app-pages/app-pages.css";
import { pageContext } from "../context";
import { filled } from "../storefront/words";
import { Button, ButtonLink } from "../ui/button";
import { Notice, TextLink } from "../ui/parts";
import { TextField } from "../ui/text-field";
import type { Route } from "./+types/admin-create-space";

// "Crear un espacio" (Platform STEP 5 §1), until invitations arrive in STEP 9: blank, or
// from an application marked as invited. The form names an application by its id, so no
// address travels in a URL. Operators only: to anyone else, this page does not exist.

const NOT_HERE = { status: 404 };
const MARKS = /\p{M}/gu;
const NOT_SLUG = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;

/** "Lucía Vega" becomes "lucia-vega": a first suggestion, which the operator can change. */
function suggestedSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(MARKS, "")
    .toLowerCase()
    .replace(NOT_SLUG, "-")
    .replace(EDGE_HYPHENS, "");
}

interface Overview {
  applications: ApplicationRecord[];
  listings: CatalogQueueItem[];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const answer = await runApiAction<Overview>(context, request, "admin.overview", {});
  if (!answer.body?.ok || !answer.body.output) {
    throw data(null, NOT_HERE);
  }
  const chosen = new URL(request.url).searchParams.get("solicitud");
  const from = answer.body.output.applications.find((item) => item.id === chosen);
  return {
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
    name: from?.name ?? "",
    slug: from ? suggestedSlug(from.name) : "",
    email: from?.email ?? "",
    spaceLocale: from?.locale ?? "es",
  };
}

const PROBLEMS = {
  invalid: "noAccount",
  conflict: "addressTaken",
} as const satisfies Record<string, keyof AdminText>;

type FieldProblem = "addressRefused" | "fixName" | "fixEmail";

function problemsOf(issues: { path: string }[]): FieldProblem[] {
  const paths = issues.map((issue) => issue.path);
  return [
    ...(paths.includes("slug") ? (["addressRefused"] as const) : []),
    ...(paths.includes("name") ? (["fixName"] as const) : []),
    ...(paths.includes("ownerEmail") ? (["fixEmail"] as const) : []),
  ];
}

export async function action({ request, context }: Route.ActionArgs) {
  // A creator's page is the same site: only the app's own origin may post here.
  if (!isFromTheApp(request, context)) {
    throw data(null, NOT_HERE);
  }
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? "").trim();
  const answer = await runApiAction<{ slug: string }>(context, request, "space.create", {
    name: field("name"),
    slug: field("slug"),
    ownerEmail: field("email"),
    locale: field("locale"),
  });
  if (answer.status === 401 || answer.status === 404) {
    throw data(null, NOT_HERE);
  }
  const values = { name: field("name"), slug: field("slug"), email: field("email") };
  const body = answer.body as {
    ok?: boolean;
    code?: string;
    output?: { slug: string };
    issues?: { path: string }[];
  } | null;
  if (body?.ok && body.output) {
    const { creatorDomain } = context.get(pageContext);
    const { protocol } = new URL(request.url);
    return {
      created: body.output.slug,
      page: `${protocol}//${body.output.slug}.${creatorDomain}`,
    } as const;
  }
  const code = body?.code ?? "";
  return {
    values,
    problem: Object.hasOwn(PROBLEMS, code) ? PROBLEMS[code as keyof typeof PROBLEMS] : null,
    fields: problemsOf(body?.issues ?? []),
  } as const;
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta() {
  return [{ title: `Admin · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

function Form({
  words,
  locale,
  values,
  fields,
  problem,
}: {
  words: AdminText;
  locale: LocaleCode | string;
  values: { name: string; slug: string; email: string };
  fields: FieldProblem[];
  problem: "noAccount" | "addressTaken" | null;
}) {
  const errorOf = (name: FieldProblem) => (fields.includes(name) ? words[name] : undefined);
  return (
    <form className="app-form" method="post" key={JSON.stringify(values)}>
      <input type="hidden" name="locale" value={locale} />
      <TextField
        label={words.spaceName}
        name="name"
        required
        maxLength={200}
        defaultValue={values.name}
        error={errorOf("fixName")}
      />
      <TextField
        label={words.spaceAddress}
        name="slug"
        required
        maxLength={63}
        defaultValue={values.slug}
        hint={words.spaceAddressHint}
        error={errorOf("addressRefused")}
      />
      <TextField
        label={words.spaceOwnerEmail}
        name="email"
        type="email"
        required
        autoComplete="off"
        defaultValue={values.email}
        error={errorOf("fixEmail")}
      />
      {problem ? <Notice tone="error" title={words[problem]} /> : null}
      <Button type="submit">{words.createAction}</Button>
    </form>
  );
}

export default function AdminCreateSpace({ loaderData, actionData }: Route.ComponentProps) {
  const { locale, spaceLocale, name, slug, email } = loaderData;
  const words = ADMIN_TEXT[locale];
  const refused = actionData?.values ? actionData : null;
  return (
    <div className="desk opening">
      <AppHeader locale={locale} place="admin" />
      <main className="app-page app-page-narrow">
        <h1 className="app-title">{words.createSpace}</h1>
        {actionData?.created && actionData.page ? (
          <>
            <Notice tone="success" title={filled(words.created, { slug: actionData.created })} />
            <ButtonLink href={actionData.page}>{words.seePage}</ButtonLink>
          </>
        ) : (
          <Form
            words={words}
            locale={spaceLocale}
            values={refused?.values ?? { name, slug, email }}
            fields={refused?.fields ? [...refused.fields] : []}
            problem={refused?.problem ?? null}
          />
        )}
        <TextLink href="/admin">{words.backToAdmin}</TextLink>
      </main>
    </div>
  );
}
