// The chosen theme (Platform STEP 3 §2.4, STEP 16): one cookie for every host we serve, the app,
// the platform's pages and each creator's. With none, the page has no data-theme and the
// stylesheet follows prefers-color-scheme.

const COOKIE = "lr_theme";
const ONE_YEAR = 31_536_000;

type Theme = "light" | "dark";

export const isTheme = (value: unknown): value is Theme => value === "light" || value === "dark";

export function themeFromCookie(header: string | null): Theme | undefined {
  for (const part of (header ?? "").split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === COOKIE && isTheme(value)) {
      return value;
    }
  }
  return undefined;
}

/**
 * On the parent domain, so the app and every creator's host read the same choice. Only the
 * Worker reads it: HttpOnly. `domain` is CREATOR_DOMAIN without its port. A one-label name, like a
 * local run's "localhost", is a public suffix to a browser, which refuses it as a Domain: there
 * the cookie stays on the host that set it.
 */
export const themeCookie = (theme: Theme, domain: string) =>
  `${COOKIE}=${theme};${domain.includes(".") ? ` Domain=${domain};` : ""} Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax; Secure; HttpOnly`;

/** Before STEP 16 the cookie was the app host's alone: it goes, or it would shadow the new one. */
export const oldThemeCookieGone = () =>
  `${COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure; HttpOnly`;

/**
 * Where the toggle goes back to: a page on one of our hosts, parsed as a browser will, with the
 * scheme the request came on. Anything else goes to the home of the host it was posted to.
 */
export function nextOnOurHosts(next: unknown, from: URL, isOurs: (host: string) => boolean) {
  const home = `${from.origin}/`;
  if (typeof next !== "string" || next === "") {
    return home;
  }
  try {
    const url = new URL(next, from);
    return url.protocol === from.protocol && isOurs(url.host) ? url.toString() : home;
  } catch {
    return home;
  }
}
