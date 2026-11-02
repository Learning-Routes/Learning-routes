import { SIGN_IN_TEXT, type SignInText } from "@learning-routes/core/copy/sign-in";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import { type FormEvent, useEffect, useState } from "react";
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
const NOTICES = ["expired", "limited", "failed", "signed-out"] as const;
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

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData ? SIGN_IN_TEXT[loaderData.locale].title : "";
  return [{ title: `${title} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

function NoticeFor({ name, words }: { name: NoticeName; words: SignInText }) {
  switch (name) {
    case "expired":
      return (
        <Notice tone="info" title={words.expiredTitle}>
          {words.expiredBody}
        </Notice>
      );
    case "limited":
      return (
        <Notice tone="error" title={words.limitedTitle}>
          {words.limitedBody}
        </Notice>
      );
    case "failed":
      return (
        <Notice tone="error" title={words.failedTitle}>
          {words.failedBody}
        </Notice>
      );
    default:
      return (
        <Notice tone="success" title={words.signedOutTitle}>
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
  const isValid = () => AN_EMAIL.test(email.trim());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid()) {
      event.currentTarget.querySelector("input")?.focus();
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
      setInvalid(true);
    } else {
      setNotice(outcome);
    }
  }

  return (
    <>
      <ScreenTitle>{words.title}</ScreenTitle>
      <p className="sign-in-copy">{words.intro}</p>
      {notice ? <NoticeFor name={notice} words={words} /> : null}
      <form className="sign-in-form" noValidate onSubmit={submit}>
        <TextField
          label={words.emailLabel}
          name="email"
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
          onFocus={() => setInvalid(false)}
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
      {outcome === "resent" ? <Notice tone="success" title={words.resent} /> : null}
      {outcome === "limited" || outcome === "failed" ? (
        <NoticeFor name={outcome} words={words} />
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
