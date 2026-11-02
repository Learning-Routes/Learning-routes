# Platform STEP 3: The design system and the first screens

Written by the reviewer, 2 November 2026. Start only after Platform STEP 2 is merged.

## 0. Context

The platform has its rules, data, accounts and tenancy, but almost no design. The storefront home is 46 lines and the studio 14. The Ciruela tokens exist in `packages/design-tokens`, and the approved direction exists only in git-ignored files on the owner's machine: `tmp/redesign/mapa-anotado/` and `tmp/redesign/map-ciruela/`.

**The direction, from that mockup:**
- Archivo for text, wide and heavy for display; DM Mono for numbers and labels.
- Plum on a cool off-white: `--color-accent #6A2EA0` on `--color-bg #F5F2F6`. The dark theme comes from the same tokens.
- The route is the image: modules as tilted cards, topics as rings joined by a line that advances with the student, a gold ring for "you are here", diamonds for the module exam, and a dotted branch for remedial topics.
- Few words, each one doing a job. "Aprende lo que quieras, bien." "El primer módulo es gratis."

The owner wants design with soul: a committed point of view, never templated. This STEP builds the system that keeps it, and the first screens every user sees. The blocks and the interactive route map come in Platform STEP 4.

**The constraint that shapes the landing.** The storefront ships at most 1 KB of JavaScript and no hydration (ADR 0004). The mockup's hero draws the map with three.js, about 600 KB. So the hero's map is rendered on the server as SVG, with the same composition, and ships no script. The interactive map, the one a student moves through, lives in the app in Platform STEP 4, where React is allowed.

## Batch rules

- Same rules as always:
  - no tool or AI attribution anywhere: no Co-Authored-By trailers, no generated-with lines, no mentions in docs;
  - no secrets and no personal data, in a public repository;
  - exact pins at the newest release at least 14 days old;
  - red-first tests;
  - small commits.
- One PR per section, stacked. Merge §1 yourself once it is green; leave the rest open for the reviewer.
- **Skills to load before the work:**
  - frontend-design;
  - the vectorlab UX skills that apply: typography, spacing, colour-palette, forms, errors, loaders, empty-states, verbs, labels, keyboard, motion, reduced-motion, viewports, anti-slop;
  - design accessibility-review;
  - cloudflare web-perf;
  - lr-performance-budget.

  Name the ones you used in each PR.
- **Copy is Spanish first and exists in all five locales** (es, en, pt, fr, it) from day one, from `core/locales`. Never machine-translate silently: list every string you translated in the PR, so the owner can check the tone.
- **Screenshots go in the PR description,** at 390 and 1440 px wide, light and dark, so the owner can judge them without running anything. They show only fixture data.

## §1. Keep the reference safe

1. Copy `tmp/redesign/mapa-anotado/` into `platform/docs/design/reference/mapa-anotado/`.
   - Keep `index.html` unchanged. Do not commit `three.min.js`: load three.js in that reference page from a pinned CDN URL with an integrity hash, or note in its README how to run it.
   - Check the page for personal data first: any name, email or photo is replaced with a fixture.
2. Commit `tmp/redesign/map-ciruela/*.png` as `platform/docs/design/reference/screens/`.
3. Write `platform/docs/design/README.md`:
   - the direction above, in your own words;
   - what each reference file shows;
   - the rule that the reference is the target and the tokens are the source of truth.
4. CODEOWNERS adds `platform/docs/design/` and `packages/design-tokens/`.

## §2. The design system

1. **Tokens, complete and checked:**
   - Colour, type, space, radius, shadow, motion and z-index all live in `packages/design-tokens`, with light values on `:root` and dark ones on `[data-theme="dark"]`, as today.
   - Use a spacing scale in a 4 px base, and a type scale with Archivo's width axis for display.
   - Motion has durations and easings, and every motion token collapses to 0 under `prefers-reduced-motion`.
   - A test checks WCAG AA contrast, in both themes, for every text-on-surface pair the components use. Large display text counts at 3:1, body at 4.5:1. A failing pair fails the build; fix the token, not the test.
2. **Styling stays CSP-safe:**
   - static CSS files only, built from the tokens; no CSS-in-JS and no inline `style=`;
   - Tailwind 4 is allowed only if it compiles to one static stylesheet. Decide with numbers, measuring CSS size both ways, and say which in the PR;
   - the storefront's CSS budget is 20 KB gzip, enforced with size-limit.
3. **Components** in `apps/web/app/ui/`, each with a test:
   - Button: primary, secondary, quiet; with sizes, a loading state and a disabled state;
   - Link;
   - TextField, with label, hint and error;
   - Card;
   - Badge, as in "Gratis";
   - ThemeToggle;
   - SiteHeader;
   - Notice, for success, info and error;
   - EmptyState.

   **Each one:**
   - uses only tokens;
   - has visible focus styles;
   - works by keyboard;
   - meets 44 px touch targets;
   - has no layout shift on load.

   **The props say what a thing is** (`tone="danger"`), never how it looks (`red`).
4. **The theme:**
   - The toggle sets `data-theme` and remembers it in a cookie on the app host only, never on storefront hosts, since those strip cookies. With no choice made, it follows `prefers-color-scheme`.
   - The CSS reads the setting before first paint with no inline script: the server renders the attribute from the cookie on the app, and storefronts use the media query only.
5. **A components page at `/studio/_design`, dev only.** It shows every component in every state, in both themes. It is the page the visual tests photograph. A test checks that it is not reachable in production.

## §3. Sign-in

1. **Every screen is designed:**
   - "Entrar": an email field and one button;
   - "Revisa tu correo": the address shown back, a way to resend after a wait, and a way to change the address;
   - the confirmation page, "Entrar como …", with its one POST button;
   - expired or used link;
   - rate-limited;
   - signed out;
   - every error, in the user's words, never a code.
2. **The magic-link email:**
   - HTML and text, from one localized template;
   - the brand mark and the accent colour, with no remote images;
   - legible with images off and in dark mode;
   - one link, the app origin only, a subject that says what it is, and no tracking pixels.

   Snapshot-test the rendered HTML and text.
3. **Clear a dead session.** A 401 response clears the session cookie (left over from Platform STEP 2), with a test.
4. **Copy rules for these screens:**
   - verbs on buttons ("Enviar enlace", not "Enviar");
   - no blame in errors;
   - say what happens next;
   - state the time a link lasts.

## §4. The landing, as in the mockup

1. **Rebuild `routes/storefront/home.tsx`** as the mockup's landing: the header, the hero, the "Crear mi ruta" call to action with "El primer módulo es gratis.", and the four "how it works" sections.
2. **The hero's route map is server-rendered SVG** from `packages/route-map`'s geometry:
   - It shows the same tilted module cards, rings, line, gold "you are here", exam diamond and dotted remedial branch.
   - Any motion is CSS only, and none under reduced motion.
   - It ships no JavaScript, so the storefront stays within its 1 KB budget.
   - It scales from 390 px to 1440 px, as the mockup does.
3. **Performance targets**, measured with Lighthouse in CI on the built preview, mobile profile:
   - LCP under 1.8 s;
   - CLS under 0.05;
   - TBT under 50 ms.

   Fonts are preloaded and subset for the five locales, and the hero text never waits for a font.
4. **SEO:**
   - one `<h1>`;
   - meta description;
   - Open Graph image rendered from the hero SVG at build time;
   - `hreflang` as already set.

## §5. Design checks in CI

1. **Visual regression with Playwright screenshots:**
   - the components page;
   - every sign-in screen;
   - the landing, at 390 and 1440 px, in light and dark.

   A changed pixel over the threshold fails the build; an intended change updates the baseline in the same PR, with the before and after attached. Pin the browser build so baselines are stable, and record them on the CI runner, not a laptop.
2. **Accessibility with axe-core** on every page above: zero serious or critical violations. A keyboard-only test walks sign-in from start to end.
3. **Reduced motion:** a test runs the pages under `prefers-reduced-motion: reduce` and checks that no animation runs.
4. **Copy:** a check fails when a locale is missing a key that Spanish has.
5. **All of it runs in `pnpm check`,** so contributors and CI agree.

## §6. Housekeeping the owner approved

1. Delete the 14 local branches already merged into `main`, and the worktrees for `main-green` and `phone-tests-true-viewport`.
2. **The `batch-1` branch:**
   - save its two uncommitted files and the branch itself as a patch, in `tmp/archive/batch-1.patch`;
   - keep `STEP_42_BATCH_1.md` in `tmp/archive/`;
   - then delete the branch and its worktree.

   That work belongs to the Rails redesign, which the platform rebuilds.
3. **Leave these alone:**
   - `tmp/ads` and `tmp/video-voz`, the owner's media;
   - `.superpowers/` and the old audit archives in `tmp/`, until the owner says otherwise.

## Report, in one message

- **PRs and runs:** the PRs and their green runs, with the screenshots.
- **Numbers:** the CSS and JavaScript size per surface, and the Lighthouse numbers.
- **Accessibility and visuals:** the axe results, and the visual-test baselines that were recorded.
- **Copy:** every string you translated.
- **Departures and questions:** every departure from this STEP, and the questions for the owner.
