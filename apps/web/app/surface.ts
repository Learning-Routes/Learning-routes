import type { UIMatch } from "react-router";

/** A route module exports `handle = storefront` to be served as plain HTML. */
export const storefront = { storefront: true } as const;

/** A route module exports `handle = challengePage` to load Turnstile, and nothing else may. */
export const challengePage = { challenge: true } as const;

/** A route module exports `handle = lessonPage` for a creator's images, sound and video. */
export const lessonPage = { lessonMedia: true } as const;

export function isStorefront(matches: UIMatch[]): boolean {
  return matches.some(
    (match) => (match.handle as { storefront?: boolean } | undefined)?.storefront,
  );
}
