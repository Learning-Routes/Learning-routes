// The chosen theme, in a cookie on the app's host only (Platform STEP 3 §2.4). With
// none, the page has no data-theme and the stylesheet follows prefers-color-scheme.

const COOKIE = "lr_theme";
const ONE_YEAR = 31_536_000;
const ANOTHER_HOST = /^\/[/\\]/;

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

/** Host-only: no Domain, so it never reaches a storefront's subdomain. */
export const themeCookie = (theme: Theme) =>
  `${COOKIE}=${theme}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax; Secure`;

/** Where to go back to: a path on this site, or the studio. */
export function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !ANOTHER_HOST.test(next)
    ? next
    : "/studio";
}
