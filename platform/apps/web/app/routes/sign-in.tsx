import { SIGN_IN_TEXT, type SignInText } from "@learning-routes/core/copy/sign-in";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import { type FormEvent, type Ref, useEffect, useRef, useState } from "react";
import { redirect } from "react-router";
import { requestSignInLink } from "../api";
import { ScreenTitle, SignInShell } from "../sign-in/shell";
import "../sign-in/sign-in.css";
import { Button } from "../ui/button";
import { Notice } from "../ui/parts";
import { TextField } from "../ui/text-field";
import type { Route } from "./+types/sign-in";

// "Entrar" and "Revisa tu correo" (Platform STEP 3 §3). Nothing here carries the
// address in a URL: it stays in this page's memory.

const AN_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_WAIT_SECONDS = 30;
const NOTICES = ["expired", "reopen", "limited", "failed", "signed-out"] as const;
type NoticeName = (typeof NOTICES)[number];

const isNotice = (value: string | null): value is NoticeName =>
  (NOTICES as readonly (string | null)[]).includes(value);

export function loader({ request }: Route.LoaderArgs) {
  const notice = new URL(request.url).searchParams.get("notice");
  return {
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
    notice: isNotice(notice) ? notice : null,
  };
}

// Reached only by a submit before the page has hydrated, or with no script. The field
// has no name, so nothing of the address came with it.
export function action() {
  return redirect("/sign-in", 303);
}

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData ? SIGN_IN_TEXT[loaderData.locale].title : "";
  return [{ title: `${title} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

function NoticeFor({
  name,
  words,
  ref,
}: {
  name: NoticeName;
  words: SignInText;
  ref?: Ref<HTMLDivElement>;
}) {
  switch (name) {
    case "expired":
      return (
        <Notice ref={ref} tone="info" title={words.expiredTitle}>
          {words.expiredBody}
        </Notice>
      );
    case "reopen":
      return <Notice ref={ref} tone="info" title={words.reopenLink} />;
    case "limited":
      return (
        <Notice ref={ref} tone="error" title={words.limitedTitle}>
          {words.limitedBody}
        </Notice>
      );
    case "failed":
      return (
        <Notice ref={ref} tone="error" title={words.failedTitle}>
          {words.failedBody}
        </Notice>
      );
    default:
      return (
        <Notice ref={ref} tone="success" title={words.signedOutTitle}>
          {words.signedOutBody}
        </Notice>
      );
  }
}

function Ask({
  words,
  initialEmail,
  initialNotice,
  onSent,
}: {
  words: SignInText;
  initialEmail: string;
  initialNotice: NoticeName | null;
  onSent: (email: string) => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [invalid, setInvalid] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(initialNotice);
  const noticeRef = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLFormElement>(null);
  const isValid = () => AN_EMAIL.test(email.trim());
  const focusField = () => field.current?.querySelector("input")?.focus();

  useEffect(() => {
    if (notice) {
      noticeRef.current?.focus();
    }
  }, [notice]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) {
      return;
    }
    if (!isValid()) {
      focusField();
      setInvalid(true);
      return;
    }
    setSending(true);
    setNotice(null);
    const outcome = await requestSignInLink(email.trim());
    setSending(false);
    if (outcome === "sent") {
      onSent(email.trim());
    } else if (outcome === "invalid") {
      focusField();
      setInvalid(true);
    } else {
      setNotice(outcome);
    }
  }

  return (
    <>
      <ScreenTitle takeFocus={!initialNotice}>{words.title}</ScreenTitle>
      <p className="sign-in-copy">{words.intro}</p>
      <noscript>
        <Notice tone="info" title={words.needsScript} />
      </noscript>
      {notice ? <NoticeFor ref={noticeRef} name={notice} words={words} /> : null}
      <form ref={field} className="sign-in-form" method="post" noValidate onSubmit={submit}>
        {/* No name: a submit before the page hydrates must carry no address anywhere. */}
        <TextField
          label={words.emailLabel}
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder={words.emailExample}
          required
          value={email}
          error={invalid ? words.invalidEmail : undefined}
          onChange={(event) => {
            setEmail(event.target.value);
            setInvalid(false);
          }}
          onBlur={() => setInvalid(email.trim().length > 0 && !isValid())}
        />
        <Button type="submit" loading={sending} loadingLabel={words.sending}>
          {words.sendLink}
        </Button>
      </form>
    </>
  );
}

function Sent({
  words,
  email,
  onChangeAddress,
}: {
  words: SignInText;
  email: string;
  onChangeAddress: () => void;
}) {
  const [wait, setWait] = useState(RESEND_WAIT_SECONDS);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<"resent" | "limited" | "failed" | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outcome) {
      noticeRef.current?.focus();
    }
  }, [outcome]);

  useEffect(() => {
    if (wait <= 0) {
      return;
    }
    const tick = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(tick);
  }, [wait]);

  async function resend() {
    setSending(true);
    const result = await requestSignInLink(email);
    setSending(false);
    if (result === "sent") {
      setOutcome("resent");
      setWait(RESEND_WAIT_SECONDS);
    } else {
      setOutcome(result === "limited" ? "limited" : "failed");
    }
  }

  return (
    <>
      <ScreenTitle>{words.sentTitle}</ScreenTitle>
      <p className="sign-in-copy">
        {words.sentTo} <span className="sign-in-address">{email}</span>
      </p>
      <p className="sign-in-copy">{words.sentNext}</p>
      {outcome === "resent" ? <Notice ref={noticeRef} tone="success" title={words.resent} /> : null}
      {outcome === "limited" || outcome === "failed" ? (
        <NoticeFor ref={noticeRef} name={outcome} words={words} />
      ) : null}
      <div className="sign-in-actions">
        {wait > 0 ? (
          <p className="sign-in-wait" role="timer">
            {words.resendIn.replace("{seconds}", String(wait))}
          </p>
        ) : (
          <Button
            emphasis="secondary"
            loading={sending}
            loadingLabel={words.sending}
            onClick={resend}
          >
            {words.resend}
          </Button>
        )}
        <Button emphasis="quiet" onClick={onChangeAddress}>
          {words.changeAddress}
        </Button>
      </div>
    </>
  );
}

export default function SignIn({ loaderData }: Route.ComponentProps) {
  const { locale, notice } = loaderData;
  const words = SIGN_IN_TEXT[locale];
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [lastEmail, setLastEmail] = useState("");

  return (
    <SignInShell locale={locale} step={sentTo ? 2 : 1}>
      {sentTo ? (
        <Sent
          words={words}
          email={sentTo}
          onChangeAddress={() => {
            setLastEmail(sentTo);
            setSentTo(null);
          }}
        />
      ) : (
        <Ask words={words} initialEmail={lastEmail} initialNotice={notice} onSent={setSentTo} />
      )}
    </SignInShell>
  );
}
