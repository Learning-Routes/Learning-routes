# ADR 0008: Storefront pages may load JavaScript after they paint

**Status:** accepted, 3 November 2026 (Platform STEP 6 §1). It replaces the "storefront: 0 JS" rule of Platform STEP 3.

## Context

The owner wants back the v1 landing, a 3D map you travel by scrolling (STEP 41). That needs three.js. "0 JS" protected three things: the first paint needs no script, the page works without JavaScript, and the page is the same HTML for every visitor. Those three stay.

## Decision

**Blocking JavaScript stays at 0.** The text is server HTML, and it paints before any script runs.

**Enhancement JavaScript** may load after the first paint, as a module from our own origin, only when it adds motion, and never for content or links.

| Page | Enhancement JavaScript, gzip |
|---|---|
| Landing | at most 190 KB, three.js included |
| Any other storefront page | at most 15 KB |

| Lighthouse, mobile | Landing | Elsewhere |
|---|---|---|
| LCP | under 1.8 s | under 1.8 s |
| CLS | under 0.05 | under 0.05 |
| TBT | under 150 ms | 0 ms |

Every storefront page works fully with JavaScript off.

**three.js:**
- is bundled by Vite as a lazily imported chunk and served from our origin, under the strict CSP;
- is imported only after `requestIdleCallback` (or `load` where that is missing), only when WebGL exists and `prefers-reduced-motion` is not `reduce`;
- is the only page weight of its kind: no other page imports it;
- never loads without a real GPU, where the map would crawl and block the page: those visitors get the panels as text. `#mapa` in the address forces it, for the browser tests.

**The WebGL probe runs in a worker,** because a device's first context can block for seconds.

**On CI** the runner has no GPU, so Lighthouse's gate on the landing measures the text. It also measures the map forced on in software WebGL, and fails only above a ceiling of 4 s of TBT, to catch a large regression. The map on a real GPU is measured by hand and reported in the pull request.

**Fixed addresses.** Each page's script is built to `/enhance/<page>.js`, unhashed, and imports hashed chunks. A storefront page sits in the edge cache, so a fixed address means a cached page never names a script an earlier deploy removed.

## What holds it

- `apps/web/.size-limit.js` measures each script with everything it imports, and fails over budget.
- `scripts/check-lighthouse.mjs` fails over the targets above.
- `apps/web/e2e/storefront.spec.ts` fails on any script that is not a module from `/enhance/`, on React or a preload in a storefront page, and on a page that loses its text or links with JavaScript off.
- `apps/web/test/three-gate.test.ts` holds when three.js may load.

## Measured

three.js 0.186.1, the newest release at least 14 days old on 3 November 2026, with the parts the v1 scene uses: 142.88 KB gzip including the entry script. That leaves about 47 KB for the scene and the placement code.
