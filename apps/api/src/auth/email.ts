import { INVITATION_TEXT } from "@learning-routes/core/copy/invitation";
import { SIGN_IN_TEXT } from "@learning-routes/core/copy/sign-in";
import { BRAND, type LocaleCode } from "@learning-routes/core/locales";
import { logEvent } from "../log";

const filled = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (whole, key) => values[key] ?? whole);

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

export interface InvitationMessage {
  email: string;
  name: string;
  url: string;
  locale: LocaleCode;
}

export interface EmailSender {
  sendMagicLink(message: MagicLinkMessage): Promise<void>;
  sendInvitation(message: InvitationMessage): Promise<void>;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const HTML_SPECIAL = /[&<>"']/g;
const escapeHtml = (text: string) =>
  text.replace(HTML_SPECIAL, (char) => HTML_ESCAPES[char] ?? char);

/** Tokens' values, since an email can't read the stylesheet; test/auth/email.test.ts keeps them equal. */
const INK = "#1D1226";
const SOFT_INK = "#4A3D54";
const PAPER = "#F5F2F6";
const SHEET = "#FFFFFF";
const ACCENT = "#6A2EA0";
const HERE = "#E79A0F";

interface EmailWords {
  subject: string;
  heading: string;
  intro: string;
  action: string;
  expiry: string;
  ignore: string;
  fallback: string;
  noTracking: string;
}

/**
 * One email in one locale: the same words as text and as HTML. Tables and bgcolor, since mail
 * clients drop most CSS; the mark is a cell and a character, so it shows with images off, and
 * there is no remote image and one link, on the app's origin.
 */
function linkEmail(url: string, locale: LocaleCode, words: EmailWords) {
  const text = [
    words.heading,
    "",
    words.intro,
    "",
    url,
    "",
    words.expiry,
    words.ignore,
    "",
    `${BRAND}. ${words.noTracking}`,
  ].join("\n");
  const type = "font-family:Arial,Helvetica,sans-serif";
  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(words.subject)}</title>
<style>
@media (prefers-color-scheme: dark) {
  .paper { background-color: #150E1C !important; }
  .sheet { background-color: #241931 !important; }
  .ink { color: #F2ECF6 !important; }
  .soft { color: #CDBFD8 !important; }
}
</style>
</head>
<body class="paper" style="margin:0;padding:0;background-color:${PAPER}">
<table role="presentation" class="paper" width="100%" cellpadding="0" cellspacing="0" bgcolor="${PAPER}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" class="sheet" width="100%" cellpadding="0" cellspacing="0" bgcolor="${SHEET}" style="max-width:480px;border-radius:18px">
<tr><td style="padding:32px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="26" height="26" align="center" bgcolor="${ACCENT}" style="border-radius:7px;color:${HERE};${type};font-size:12px;line-height:26px">&#9679;</td>
<td class="ink" style="padding-left:8px;color:${INK};${type};font-size:15px;font-weight:bold">${escapeHtml(BRAND)}</td>
</tr></table>
<h1 class="ink" style="margin:24px 0 8px;color:${INK};${type};font-size:22px;line-height:1.3">${escapeHtml(words.heading)}</h1>
<p class="ink" style="margin:0 0 8px;color:${INK};${type};font-size:16px;line-height:1.5">${escapeHtml(words.intro)}</p>
<p class="soft" style="margin:0 0 24px;color:${SOFT_INK};${type};font-size:14px;line-height:1.5">${escapeHtml(words.expiry)}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td bgcolor="${ACCENT}" style="border-radius:10px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 24px;color:#FFFFFF;${type};font-size:16px;font-weight:bold;text-decoration:none">${escapeHtml(words.action)}</a></td>
</tr></table>
<p class="soft" style="margin:24px 0 8px;color:${SOFT_INK};${type};font-size:14px;line-height:1.5">${escapeHtml(words.ignore)}</p>
<p class="soft" style="margin:0 0 4px;color:${SOFT_INK};${type};font-size:14px;line-height:1.5">${escapeHtml(words.fallback)}</p>
<p class="soft" style="margin:0;color:${SOFT_INK};${type};font-size:13px;line-height:1.5;word-break:break-all">${escapeHtml(url)}</p>
</td></tr>
</table>
<p class="soft" style="margin:16px 0 0;color:${SOFT_INK};${type};font-size:12px;line-height:1.5">${escapeHtml(BRAND)}. ${escapeHtml(words.noTracking)}</p>
</td></tr>
</table>
</body>
</html>
`;
  return { subject: words.subject, text, html };
}

/** The sign-in email in one locale. */
export function magicLinkEmail({ url, locale }: Pick<MagicLinkMessage, "url" | "locale">) {
  const words = SIGN_IN_TEXT[locale];
  return linkEmail(url, locale, {
    subject: words.emailSubject,
    heading: words.emailHeading,
    intro: words.emailIntro,
    action: words.emailAction,
    expiry: words.emailExpiry,
    ignore: words.emailIgnore,
    fallback: words.emailFallback,
    noTracking: words.emailNoTracking,
  });
}

/** The invitation to teach, from the same template. */
function invitationEmail({ url, locale, name }: Omit<InvitationMessage, "email">) {
  const words = INVITATION_TEXT[locale];
  return linkEmail(url, locale, {
    ...words.email,
    heading: filled(words.email.heading, { name }),
    noTracking: SIGN_IN_TEXT[locale].emailNoTracking,
    fallback: SIGN_IN_TEXT[locale].emailFallback,
  });
}

/** Local development only: the link goes to wrangler dev's log. Refused in production. */
export const logSender = (env: Pick<Env, "ENVIRONMENT">): EmailSender => ({
  async sendMagicLink({ email, url }) {
    if (env.ENVIRONMENT === "production") {
      throw new Error("the log sender runs only in development");
    }
    console.log(JSON.stringify({ message: "sign-in link (development only)", email, url }));
  },
  async sendInvitation({ email, url }) {
    if (env.ENVIRONMENT === "production") {
      throw new Error("the log sender runs only in development");
    }
    console.log(JSON.stringify({ message: "invitation (development only)", email, url }));
  },
});

/** Cloudflare Email Sending, from the address the binding allows. */
const bindingSender = (env: Pick<Env, "EMAIL" | "EMAIL_FROM">): EmailSender => {
  const send = async (to: string, email: { subject: string; text: string; html: string }) => {
    try {
      await env.EMAIL.send({ from: { email: env.EMAIL_FROM, name: BRAND }, to, ...email });
    } catch (error) {
      // The binding's error code, never the address or the link.
      const code = (error as { code?: unknown }).code;
      logEvent({ message: "email not sent", error: String(code ?? "unknown") });
      throw new Error("the email could not be sent");
    }
  };
  return {
    sendMagicLink: ({ email, url, locale }) => send(email, magicLinkEmail({ url, locale })),
    sendInvitation: ({ email, ...message }) => send(email, invitationEmail(message)),
  };
};

export function emailSenderFor(env: Env): EmailSender {
  return env.ENVIRONMENT === "development" ? logSender(env) : bindingSender(env);
}
