import { data } from "react-router";
import type { Route } from "./+types/brand-css";

// A creator's colour on their primary actions (Platform STEP 4 §5.1). A stylesheet of its
// own, because the strict CSP allows no inline style. The name is the colour, and only a
// colour passes, so nothing else can reach this CSS. It never changes, so it keeps.
const FILE = /^([0-9a-f]{6})\.css$/;
const A_YEAR = 31_536_000;

export function loader({ params }: Route.LoaderArgs) {
  const hex = FILE.exec(params.file)?.[1];
  if (hex === undefined) {
    throw data(null, { status: 404 });
  }
  // Specificity over the design tokens, whichever stylesheet comes first, in both themes.
  const css = `:root:root:root{--color-accent:#${hex};--color-accent-text:#fff;--color-accent-hover:color-mix(in srgb,#${hex} 85%,#000)}`;
  return new Response(css, {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": `public, max-age=${A_YEAR}, s-maxage=${A_YEAR}, immutable`,
    },
  });
}
