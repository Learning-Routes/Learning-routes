import { readFileSync } from "node:fs";
import { LOCALES } from "@learning-routes/core/locales";
import { describe, expect, it } from "vitest";
import { emailSenderFor, magicLinkEmail } from "../../src/auth/email";

// Sending sign-in links (Platform STEP 2 review, owner's answer 2): through
// Cloudflare Email Sending's send_email binding, as text and HTML from one
// localized template. The log sender exists for local development only.

const ANY_LINK = /href="[^"]*"/g;
const ANY_IMAGE = /<img|background=/i;
const URL_WITH_FRAGMENT = "https://app.example.test/sign-in/confirm#token=abc";

function fakeBinding() {
  const sent: unknown[] = [];
  const binding = {
    send: async (message: unknown) => {
      sent.push(message);
      return { messageId: "m-1" };
    },
  } as unknown as SendEmail;
  return { sent, binding };
}

describe("the sign-in email", () => {
  it("has a subject, text and HTML in every locale, each with the link", () => {
    for (const locale of LOCALES) {
      const email = magicLinkEmail({ url: URL_WITH_FRAGMENT, locale });
      expect(email.subject.length, locale).toBeGreaterThan(0);
      expect(email.text, locale).toContain(URL_WITH_FRAGMENT);
      expect(email.html, locale).toContain(`href="${URL_WITH_FRAGMENT}"`);
      expect(email.html, locale).toContain(`<html lang="${locale}">`);
    }
    const subjects = new Set(LOCALES.map((locale) => magicLinkEmail({ url: "x", locale }).subject));
    expect(subjects.size).toBe(LOCALES.length);
  });

  it("escapes the link in the HTML", () => {
    const email = magicLinkEmail({ url: 'https://x.test/"><script>', locale: "en" });
    expect(email.html).not.toContain("<script>");
  });
});

describe("the email's design", () => {
  const { text, html, subject } = magicLinkEmail({ url: URL_WITH_FRAGMENT, locale: "es" });

  it("renders as it was approved, text and HTML", () => {
    expect(subject).toMatchSnapshot();
    expect(text).toMatchSnapshot();
    expect(html).toMatchSnapshot();
  });

  it("has one link, on the app's origin, no remote image and no pixel", () => {
    expect(html.match(ANY_LINK)).toEqual([`href="${URL_WITH_FRAGMENT}"`]);
    expect(html).not.toMatch(ANY_IMAGE);
    expect(html).not.toContain("url(");
  });

  it("says what it is and how long it lasts", () => {
    expect(subject).toContain("enlace");
    expect(text).toContain("5 minutos");
    expect(html).toContain("5 minutos");
  });

  it("works in dark mode: it declares both schemes and repaints every surface", () => {
    expect(html).toContain('content="light dark"');
    expect(html).toContain("prefers-color-scheme: dark");
  });

  it("uses the tokens' values", () => {
    const tokens = readFileSync(
      new URL("../../../../packages/design-tokens/tokens.css", import.meta.url),
      "utf8",
    );
    for (const [name, value] of [
      ["--color-txt", "#1D1226"],
      ["--color-sub", "#4A3D54"],
      ["--color-bg", "#F5F2F6"],
      ["--color-accent", "#6A2EA0"],
      ["--color-highlight", "#E79A0F"],
    ]) {
      expect(tokens).toContain(`${name}: ${value};`);
      expect(html).toContain(value as string);
    }
  });
});

describe("the sender", () => {
  it("sends through the send_email binding, from the configured address", async () => {
    const { sent, binding } = fakeBinding();
    const env = {
      ENVIRONMENT: "production",
      EMAIL: binding,
      EMAIL_FROM: "sign-in@example.com",
    } as unknown as Env;
    await emailSenderFor(env).sendMagicLink({
      email: "learner@example.com",
      url: URL_WITH_FRAGMENT,
      locale: "es",
    });
    const { subject, text, html } = magicLinkEmail({ url: URL_WITH_FRAGMENT, locale: "es" });
    expect(sent).toEqual([
      {
        from: { email: "sign-in@example.com", name: expect.any(String) },
        to: "learner@example.com",
        subject,
        text,
        html,
      },
    ]);
  });

  it("logs the link only in development, and refuses to in production", async () => {
    const { sent, binding } = fakeBinding();
    const dev = emailSenderFor({ ENVIRONMENT: "development", EMAIL: binding } as unknown as Env);
    await dev.sendMagicLink({ email: "learner@example.com", url: URL_WITH_FRAGMENT, locale: "en" });
    expect(sent).toEqual([]);
    const { logSender } = await import("../../src/auth/email");
    await expect(
      logSender({ ENVIRONMENT: "production" } as Env).sendMagicLink({
        email: "learner@example.com",
        url: URL_WITH_FRAGMENT,
        locale: "en",
      }),
    ).rejects.toThrow("only in development");
  });
});
