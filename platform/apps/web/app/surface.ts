import type { UIMatch } from "react-router";

/** A route module exports `handle = storefront` to be served as plain HTML. */
export const storefront = { storefront: true } as const;

export function isStorefront(matches: UIMatch[]): boolean {
  return matches.some(
    (match) => (match.handle as { storefront?: boolean } | undefined)?.storefront,
  );
}
