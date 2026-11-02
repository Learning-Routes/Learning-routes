import { SIGN_IN_TEXT } from "@learning-routes/core/copy/sign-in";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { peekSignInLink } from "../api";
import { ScreenTitle, SignInShell } from "../sign-in/shell";
import "../sign-in/sign-in.css";
import { Button } from "../ui/button";
import type { Route } from "./+types/sign-in-confirm";

// "Entrar como …" (Platform STEP 3 §3). The link's token is in the fragment, which no
// request carries: only this page's script sees it, asks the API which address it
// signs in, and puts it in the form. A GET signs in nobody, and a form's POST is the
// only thing that does. The address comes from the API, never from the link, so a
// crafted link can't show someone else's.

const CONFIRM_ACTION = "/api/auth/magic-link/confirm";

export function headers() {
  return {
    // Not no-referrer: a browser then sends the form's POST with Origin: null, which
    // the API's origin check refuses.
    "Referrer-Policy": "same-origin",
    "Cache-Control": "no-store",
  };
}

export function loader({ request }: Route.LoaderArgs) {
  return { locale: negotiateLocale(request.headers.get("accept-language"), "es") };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData ? SIGN_IN_TEXT[loaderData.locale].confirmTitle : "";
  return [{ title: `${title} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

const tokenInFragment = (hash: string) => new URLSearchParams(hash.slice(1)).get("token");

export default function SignInConfirm({ loaderData }: Route.ComponentProps) {
  const { locale } = loaderData;
  const words = SIGN_IN_TEXT[locale];
  const navigate = useNavigate();
  const [link, setLink] = useState<{ token: string; email: string } | null>(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    const token = tokenInFragment(window.location.hash);
    // Out of the address bar and the history at once.
    window.history.replaceState(null, "", window.location.pathname);
    async function check() {
      const found = token ? await peekSignInLink(token) : "gone";
      if (token && found !== "gone" && found !== "failed") {
        setLink({ token, email: found.email });
      } else {
        await navigate(`/sign-in?notice=${found === "failed" ? "failed" : "expired"}`, {
          replace: true,
        });
      }
    }
    check().catch(() => undefined);
  }, [navigate]);

  return (
    <SignInShell locale={locale} step={3}>
      {link ? (
        <>
          <ScreenTitle>
            {words.confirmTitle} <span className="sign-in-address">{link.email}</span>
          </ScreenTitle>
          <p className="sign-in-copy">{words.confirmOnce}</p>
          <form
            className="sign-in-confirm"
            method="post"
            action={CONFIRM_ACTION}
            onSubmit={() => setPosting(true)}
          >
            <input type="hidden" name="token" value={link.token} />
            <Button type="submit" loading={posting} loadingLabel={words.checking}>
              {words.confirmAction}
            </Button>
          </form>
        </>
      ) : (
        <>
          <h1 className="sign-in-title">{words.confirmTitle}</h1>
          <p className="sign-in-checking" role="status">
            <span className="spinner" />
            {words.checking}
          </p>
        </>
      )}
    </SignInShell>
  );
}
