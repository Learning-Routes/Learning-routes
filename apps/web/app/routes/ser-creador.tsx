import { APP_PAGES_TEXT, type AppPagesText } from "@learning-routes/core/copy/app-pages";
import { UI_COPY } from "@learning-routes/core/copy/ui";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useRouteLoaderData } from "react-router";
import { sendApplication } from "../api";
import "../app-pages/app-pages.css";
import { pageContext } from "../context";
import { filled } from "../storefront/words";
import { challengePage } from "../surface";
import { Button } from "../ui/button";
import { Notice } from "../ui/parts";
import { Rising } from "../ui/rising";
import { SiteHeader } from "../ui/site-header";
import { TextField } from "../ui/text-field";
import type { Route } from "./+types/ser-creador";

// "Quiero enseñar", from v2's Ensenar (Platform STEP 4 §6.3): no account needed. The API
// checks the Turnstile token with Siteverify; the widget here only earns one. A token works
// once, so a failed try resets the widget before the next.

const WHEN_LOADED = "onTurnstileLoad";
const CHALLENGE_SCRIPT = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=${WHEN_LOADED}`;
const ACTION = "apply";
const AN_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const A_WEB_ADDRESS = /^https?:\/\/\S+$/i;

export const handle = challengePage;

export function loader({ request, context }: Route.LoaderArgs) {
  return {
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
    siteKey: context.get(pageContext).turnstileSiteKey,
    platformOrigin: context.get(pageContext).platformOrigin,
  };
}

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData ? APP_PAGES_TEXT[loaderData.locale].teachTitle : "";
  return [{ title: `${title} · ${BRAND}` }, { name: "description", content: title }];
}

type Field = "name" | "email" | "teaches" | "link";

function problemsIn(form: FormData): Partial<Record<Field, keyof AppPagesText>> {
  const text = (name: Field) => String(form.get(name) ?? "").trim();
  return {
    ...(text("name") ? {} : { name: "fixName" as const }),
    ...(AN_EMAIL.test(text("email")) ? {} : { email: "fixEmail" as const }),
    ...(text("teaches") ? {} : { teaches: "fixTeaches" as const }),
    ...(text("link") === "" || A_WEB_ADDRESS.test(text("link"))
      ? {}
      : { link: "fixLink" as const }),
  };
}

declare global {
  interface Window {
    turnstile?: {
      render(
        box: HTMLElement,
        options: { sitekey: string; action: string; callback(token: string): void },
      ): string;
      reset(widget: string): void;
    };
    [WHEN_LOADED]?: () => void;
  }
}

/**
 * The widget, rendered by hand once the page has hydrated: React would remove what the
 * script put in a box it rendered. It earns a token, which works once; reset earns another.
 */
function useTurnstile(siteKey: string, nonce: string | undefined) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const token = useRef("");
  useEffect(() => {
    window[WHEN_LOADED] = () => {
      if (box.current && window.turnstile && widget.current === null) {
        widget.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          action: ACTION,
          callback: (earned) => {
            token.current = earned;
          },
        });
      }
    };
    const script = document.createElement("script");
    script.src = CHALLENGE_SCRIPT;
    script.async = true;
    script.nonce = nonce ?? "";
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [siteKey, nonce]);
  const reset = () => {
    token.current = "";
    if (widget.current !== null) {
      window.turnstile?.reset(widget.current);
    }
  };
  return { box, token, reset };
}

const REFUSALS = { challenge: "checkFailed", limited: "tooMany", failed: "sendFailed" } as const;

function ApplicationFields({
  words,
  errorFor,
}: {
  words: AppPagesText;
  errorFor: (field: Field) => string | undefined;
}) {
  return (
    <>
      <TextField
        label={words.nameLabel}
        name="name"
        autoComplete="name"
        required
        error={errorFor("name")}
      />
      <TextField
        label={words.emailLabel}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        error={errorFor("email")}
      />
      <TextField
        label={words.teachesLabel}
        name="teaches"
        placeholder={words.teachesExample}
        required
        error={errorFor("teaches")}
      />
      <TextField
        label={words.linkLabel}
        name="link"
        type="url"
        inputMode="url"
        placeholder={words.linkExample}
        hint={words.linkHint}
        error={errorFor("link")}
      />
    </>
  );
}

function ApplicationForm({
  words,
  locale,
  siteKey,
  onSent,
}: {
  words: AppPagesText;
  locale: string;
  siteKey: string;
  onSent: (sent: { email: string; teaches: string }) => void;
}) {
  const nonce = useRouteLoaderData<{ nonce: string }>("root")?.nonce;
  const challenge = useTurnstile(siteKey, nonce);
  const [problems, setProblems] = useState<Partial<Record<Field, keyof AppPagesText>>>({});
  const [refusal, setRefusal] = useState<keyof typeof REFUSALS | null>(null);
  const [sending, setSending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const errorFor = (field: Field) => {
    const key = problems[field];
    return key ? (words[key] as string) : undefined;
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const found = problemsIn(form);
    setProblems(found);
    setRefusal(null);
    const [first] = Object.keys(found);
    if (first) {
      formRef.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setSending(true);
    const email = String(form.get("email")).trim();
    const teaches = String(form.get("teaches")).trim();
    const outcome = await sendApplication({
      name: String(form.get("name")).trim(),
      email,
      teaches,
      link: String(form.get("link")).trim() || null,
      locale,
      token: challenge.token.current,
    });
    setSending(false);
    if (outcome === "sent") {
      onSent({ email, teaches });
      return;
    }
    challenge.reset();
    setRefusal(outcome === "invalid" ? "failed" : outcome);
  }

  return (
    <form ref={formRef} className="app-form" method="post" noValidate onSubmit={submit}>
      <ApplicationFields words={words} errorFor={errorFor} />
      <div ref={challenge.box} className="app-challenge" />
      {refusal ? <Notice tone="error" title={words[REFUSALS[refusal]]} /> : null}
      <Button type="submit" loading={sending} loadingLabel={words.sending}>
        {words.send}
      </Button>
    </form>
  );
}

export default function QuieroEnsenar({ loaderData }: Route.ComponentProps) {
  const { locale, siteKey, platformOrigin } = loaderData;
  const words = APP_PAGES_TEXT[locale];
  const [sent, setSent] = useState<{ email: string; teaches: string } | null>(null);
  return (
    <>
      <SiteHeader
        brand={BRAND}
        brandHref={`${platformOrigin}/${locale}`}
        navLabel={UI_COPY[locale].primaryNav}
        theme={UI_COPY[locale]}
      >
        {null}
      </SiteHeader>
      <main className="teach-page moment opening">
        <div className="teach-lead">
          <h1 className="app-title">
            <Rising text={words.teachTitle} />
          </h1>
          <p className="app-copy">{words.teachIntro}</p>
          <h2 className="teach-how">{words.teachHow}</h2>
          <ol className="teach-steps">
            <li>{words.teachStep1}</li>
            <li>{words.teachStep2}</li>
            <li>{words.teachStep3}</li>
          </ol>
        </div>
        <div className="card teach-sheet">
          {sent ? (
            <>
              {/* What they asked to teach, as the first station of a new line. */}
              <figure className="teach-station">
                <svg viewBox="0 0 320 44" aria-hidden="true">
                  <path className="teach-station-ahead" d="M36 22H316" />
                  <path className="teach-station-line" d="M22 22H316" pathLength={1} />
                  <circle className="teach-station-stop" cx="22" cy="22" r="11" />
                </svg>
                <figcaption>{sent.teaches}</figcaption>
              </figure>
              <Notice tone="success" title={words.doneTitle}>
                {filled(words.doneBody, { email: sent.email })}
              </Notice>
            </>
          ) : (
            <>
              <noscript>
                <Notice tone="info" title={words.needsScript} />
              </noscript>
              <ApplicationForm words={words} locale={locale} siteKey={siteKey} onSent={setSent} />
              <p className="app-fine">{words.privacy}</p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
