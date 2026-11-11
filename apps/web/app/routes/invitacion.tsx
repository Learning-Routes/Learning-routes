import { INVITATION_TEXT } from "@learning-routes/core/copy/invitation";
import { UI_COPY } from "@learning-routes/core/copy/ui";
import { BRAND, type LocaleCode, negotiateLocale } from "@learning-routes/core/locales";
import { type FormEvent, useEffect, useRef, useState } from "react";
import "../app-pages/app-pages.css";
import { pageContext } from "../context";
import { filled } from "../storefront/words";
import { Button, ButtonLink } from "../ui/button";
import { EmptyState, Notice } from "../ui/parts";
import { Rising } from "../ui/rising";
import { SiteHeader } from "../ui/site-header";
import { TextField } from "../ui/text-field";
import type { Route } from "./+types/invitacion";

// The page an invitation's link opens. The token is in the fragment, which no request carries:
// this page reads it, clears it from the address, and asks the API what it holds.

const MARKS = /\p{M}/gu;
const NOT_SLUG = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;

const suggestedSlug = (name: string) =>
  name
    .normalize("NFD")
    .replace(MARKS, "")
    .toLowerCase()
    .replace(NOT_SLUG, "-")
    .replace(EDGE_HYPHENS, "");

export function loader({ request, context }: Route.LoaderArgs) {
  const { platformOrigin, creatorDomain } = context.get(pageContext);
  return {
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
    platformOrigin,
    creatorDomain,
  };
}

export const headers: Route.HeadersFunction = () => ({
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
});

export function meta() {
  return [{ title: BRAND }, { name: "robots", content: "noindex" }];
}

type Peeked =
  | { state: "checking" }
  | { state: "expired" | "used" | "unknown"; locale?: LocaleCode }
  | { state: "ok"; email: string; name: string; locale: LocaleCode };

const post = (path: string, body: unknown) =>
  fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

function Dead({
  peeked,
  fallback,
}: {
  peeked: "expired" | "used" | "unknown";
  fallback: LocaleCode;
}) {
  const words = INVITATION_TEXT[fallback];
  const title = { expired: words.expiredTitle, used: words.usedTitle, unknown: words.unknownTitle };
  const body = { expired: words.expiredBody, used: words.usedBody, unknown: words.unknownBody };
  return (
    <EmptyState
      title={title[peeked]}
      action={
        peeked === "used" ? (
          <ButtonLink href="/sign-in">{words.signIn}</ButtonLink>
        ) : (
          <ButtonLink href="/ser-creador">{words.askAgain}</ButtonLink>
        )
      }
    >
      {body[peeked]}
    </EmptyState>
  );
}

function Confirm({
  token,
  peeked,
  creatorDomain,
  onDead,
}: {
  token: string;
  peeked: Extract<Peeked, { state: "ok" }>;
  creatorDomain: string;
  onDead: (state: "expired" | "used" | "unknown") => void;
}) {
  const words = INVITATION_TEXT[peeked.locale];
  const [slug, setSlug] = useState(suggestedSlug(peeked.name));
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    const answer = await post("/api/invitations/accept", { token, slug }).catch(() => null);
    const body = (await answer?.json().catch(() => null)) as {
      ok?: boolean;
      code?: string;
      location?: string;
    } | null;
    if (body?.ok && body.location) {
      window.location.assign(body.location);
      return;
    }
    setBusy(false);
    if (body?.code === "expired" || body?.code === "used" || body?.code === "unknown") {
      onDead(body.code);
      return;
    }
    setProblem(
      body?.code === "conflict"
        ? words.slugTaken
        : body?.code === "invalid_input"
          ? words.slugRefused
          : words.failed,
    );
  }

  return (
    <form className="app-form" onSubmit={submit}>
      <p className="app-copy">{filled(words.intro, { email: peeked.email })}</p>
      {problem ? <Notice tone="error" title={problem} /> : null}
      <TextField
        label={words.slugLabel}
        name="slug"
        value={slug}
        onChange={(event) => setSlug(event.target.value)}
        hint={`${words.slugHint} ${slug || "…"}.${creatorDomain}`}
        required
      />
      <Button type="submit" disabled={busy}>
        {busy ? words.accepting : words.accept}
      </Button>
    </form>
  );
}

export default function Invitacion({ loaderData }: Route.ComponentProps) {
  const { locale, platformOrigin, creatorDomain } = loaderData;
  const [peeked, setPeeked] = useState<Peeked>({ state: "checking" });
  const token = useRef("");
  // Once: React's strict mode runs an effect twice, and the first run clears the fragment.
  const read = useRef(false);
  useEffect(() => {
    if (read.current) {
      return;
    }
    read.current = true;
    token.current = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    window.history.replaceState(window.history.state, "", window.location.pathname);
    post("/api/invitations/peek", { token: token.current })
      .then((answer) => answer.json() as Promise<Peeked>)
      .then(setPeeked)
      .catch(() => setPeeked({ state: "unknown" }));
  }, []);
  const shown = peeked.state === "ok" ? peeked.locale : locale;
  const words = INVITATION_TEXT[shown];
  return (
    <div className="desk opening">
      <SiteHeader
        brand={BRAND}
        brandHref={`${platformOrigin}/${shown}`}
        navLabel={UI_COPY[shown].primaryNav}
        theme={UI_COPY[shown]}
      >
        {null}
      </SiteHeader>
      <main className="app-page app-page-narrow moment" data-invitation={peeked.state}>
        {peeked.state === "ok" ? (
          <h1 className="app-title">
            <Rising text={words.title} />
          </h1>
        ) : null}
        {peeked.state === "checking" ? <p className="app-copy">{words.checking}</p> : null}
        {peeked.state === "ok" ? (
          <Confirm
            token={token.current}
            peeked={peeked}
            creatorDomain={creatorDomain}
            onDead={(state) => setPeeked({ state })}
          />
        ) : null}
        {peeked.state !== "ok" && peeked.state !== "checking" ? (
          <Dead peeked={peeked.state} fallback={shown} />
        ) : null}
      </main>
    </div>
  );
}
