import { BRAND, type LocaleCode } from "@learning-routes/core/locales";
import { SIGN_IN_TEXT } from "@learning-routes/core/sign-in-text";
import { logEvent } from "../log";

// Sending sign-in links (Platform STEP 2 §5.3, and the owner's answer in the review):
// through Cloudflare Email Sending's send_email binding, as text and HTML built
// from one localized template. The log sender is for local development only and
// refuses to run in production: no link ever goes to a production log.

export interface MagicLinkMessage {
  email: string;
  /** The app page that asks "Sign in?" and posts the token, carried in its fragment, back. */
  url: string;
  locale: LocaleCode;
}

export interface EmailSender {
  sendMagicLink(message: MagicLinkMessage): Promise<void>;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const HTML_SPECIAL = /[&<>"']/g;
export const escapeHtml = (text: string) =>
  text.replace(HTML_SPECIAL, (char) => HTML_ESCAPES[char] ?? char);

/** The sign-in email in one locale: the same words as text and as HTML. */
export function magicLinkEmail({ url, locale }: Pick<MagicLinkMessage, "url" | "locale">) {
  const words = SIGN_IN_TEXT[locale];
  const text = [words.emailIntro, "", url, "", words.emailExpiry, words.emailIgnore].join("\n");
  const html = `<!doctype html>
<html lang="${locale}">
<meta charset="utf-8">
<title>${escapeHtml(words.emailSubject)}</title>
<p>${escapeHtml(words.emailIntro)}</p>
<p><a href="${escapeHtml(url)}">${escapeHtml(words.emailAction)}</a></p>
<p>${escapeHtml(words.emailExpiry)}</p>
<p>${escapeHtml(words.emailIgnore)}</p>
</html>
`;
  return { subject: words.emailSubject, text, html };
}

/** Local development only: the link goes to wrangler dev's log. Refused in production. */
export const logSender = (env: Pick<Env, "ENVIRONMENT">): EmailSender => ({
  async sendMagicLink({ url }) {
    if (env.ENVIRONMENT === "production") {
      throw new Error("the log sender runs only in development");
    }
    console.log(JSON.stringify({ message: "sign-in link (development only)", url }));
  },
});

/** Cloudflare Email Sending, from the address the binding allows. */
const bindingSender = (env: Pick<Env, "EMAIL" | "EMAIL_FROM">): EmailSender => ({
  async sendMagicLink({ email, url, locale }) {
    try {
      await env.EMAIL.send({
        from: { email: env.EMAIL_FROM, name: BRAND },
        to: email,
        ...magicLinkEmail({ url, locale }),
      });
    } catch (error) {
      // The binding's error code, never the address or the link.
      const code = (error as { code?: unknown }).code;
      logEvent({ message: "sign-in link not sent", error: String(code ?? "unknown") });
      throw new Error("the sign-in link could not be sent");
    }
  },
});

export function emailSenderFor(env: Env): EmailSender {
  return env.ENVIRONMENT === "development" ? logSender(env) : bindingSender(env);
}
