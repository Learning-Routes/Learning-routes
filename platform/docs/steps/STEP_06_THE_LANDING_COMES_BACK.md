# Platform STEP 6: The landing comes back, and every page gets its moment

Written by the reviewer, 3 November 2026.

## 0. Context

The owner rejected the v2 landing that STEP 4 built: "no va para nada". He wants back the v1 landing that moves as you scroll, which is STEP 41's annotated map. This is the one-of-a-kind thing Learning Routes already had. And he wants every page to be just as striking: not a copy of the landing, but each with a moment of its own.

**STEP order from here:**

| STEP | Content |
| --- | --- |
| 5 | The MCP (running now) |
| 6 | This one |
| 7 | First deploy |
| 8 | Aprender |
| 9 | Pagar |
| 10 | Enseñar (studio, in-app assistant, invitations, slug changes with redirects) |

Update the numbers wherever STEP 5 §0 wrote them.

**This STEP can run in parallel with STEP 5.** Work in its own git worktree, on branches off main. Rebase onto whatever STEP 5 has merged before each PR. STEP 5's consent, Conexiones and "Conecta tu asistente" screens get this STEP's treatment in §4, after they land.

**The reference is the v1 code in this same repo** (repo root, not `platform/`), plus the live site at learningroutes.com/es:
- `app/views/landing/_stage.html.erb`, `_close.html.erb`, `_nav.html.erb`, `_footer.html.erb`;
- `app/javascript/controllers/landing_stage_controller.js` (667 lines) and `landing_close_controller.js`;
- `app/javascript/lib/landing_placement.js` (421 lines);
- the `lp-` rules in `app/assets/tailwind/application.css`;
- `docs/steps/STEP_41_THE_DESIGN_LAYER.md`, and the approved prototypes in `tmp/redesign/mapa-anotado` and `tmp/redesign/map-ciruela`;
- three.js 0.170.0, module build, loaded only for the landing.

## Batch rules

**Same as always:**
- No tool or AI attribution anywhere.
- The repo is public: no secrets, no personal data, invented names in fixtures.
- Exact pins at least 14 days old.
- Red-first tests where behaviour is testable.
- One PR per section, stacked.
- `pnpm check` before every push.
- No "wip" in titles.
- The reviewer merges §2 onward; you merge §1 once green.

**Every PR that changes a screen carries:**
- screenshots at 390 and 1440 px, light and dark;
- for anything that moves, a short screen recording (GIF or MP4) of the motion at both widths, plus one with reduced motion on.

**Design skills, loaded at user scope before any screen work and listed in each PR:**
- frontend-design (read it fully: the plan, then review the plan against the brief, then build, then critique with screenshots);
- icons8: ui-polish, ux-check, ux-writing, motion and icons8-design (icons);
- vectorlab: ux-audit, anti-slop, motion, reduced-motion, transitions, forms, empty-states, errors, labels and verbs;
- design:ux-copy;
- agent-protocols:frontend-ui-engineering;
- 21st:21st-ui (for component references only; never paste a template's look);
- anthropic 3d-essentials (three.js);
- cloudflare:web-perf;
- lr-performance-budget.

Run `/code-review` on each PR before asking for review.

## §1. The budget changes, on purpose

STEP 3 set "storefront: 0 JS". The landing now needs three.js. Change the rule without losing what it protected.

1. **New rule for storefront pages, in an ADR and in the lr-performance-budget skill:**
   - **Blocking JS is still 0.** The text is server HTML, and it paints before any script runs.
   - **Enhancement JS** may load after the first paint, as a module from our own origin, only when it adds motion, and never for content or links. Budgets in gzip:
     - landing ≤ 190 KB, three.js included;
     - every other storefront page ≤ 15 KB.
   - The rest stays: Lighthouse LCP < 1.8 s, CLS < 0.05, and TBT < 150 ms on the landing (0 elsewhere).
   - Pages work fully with JavaScript off.
2. **three.js:**
   - bundled by Vite as a lazily imported chunk, served from our origin under the strict CSP;
   - imported only after `requestIdleCallback` (or after `load`), only when WebGL exists and `prefers-reduced-motion` is not `reduce`;
   - pin the newest three.js at least 14 days old; if the API changed since 0.170.0, port to it.
3. **size-limit and the Lighthouse check** gain the new budgets, and fail above them.

## §2. The landing: the annotated map, back

1. **Port STEP 41's stage faithfully. Same experience:**
   - the 3D scale model of the route map, travelled by scrolling;
   - each chapter's text pinned flat to a free spot of the map (`landing_placement.js`);
   - the example route tabs, the legend, the chapter dots and the camera path;
   - the no-WebGL fallback that stacks the chapters.

   Port the code, don't reinvent it:
   - the Stimulus controller becomes a plain TypeScript module, with no React, because the storefront has no hydration;
   - the placement library goes into its own small package (or the existing `route-map` package);
   - the CSS becomes design-token CSS.

   Keep the controller's discipline:
   - server text first;
   - canvas and map labels `aria-hidden`;
   - pause when the tab is hidden or the stage is off screen;
   - dispose on navigation;
   - clean up every listener.
2. **Match v1 by comparing, not by memory:**
   - Run v1 locally, or use learningroutes.com/es.
   - Record both at the same scroll positions: the hero, each chapter, and the close, at 390 and 1440 px.
   - Put the pairs side by side in the PR. Differences must be deliberate and listed.
3. **The copy follows the new model:** creators teach, students learn, and module 1 is free. Use the glossary words ("práctica extra", "pregunta", "tu página") and none of the old ones. Write it in all five locales and run it through ux-writing and design:ux-copy. A starting point in Spanish, to improve, not to paste:
   - Hero: "Aprende con quien mejor lo enseña." / "Cada ruta la arma alguien que enseña ese tema: módulos en orden, temas cortos con práctica y un examen al cerrar cada módulo." Primary action: "Explorar rutas". The note: "El primer módulo es gratis."
   - Chapter 1, "Una ruta, armada por quien enseña": the creator builds it in modules, each with its topics in order.
   - Chapter 2, "Un tema a la vez": read, practise, answer a question; the line moves with you.
   - Chapter 3, "Si algo cuesta, aparece práctica extra": short extra topics under that one; then you go on.
   - Chapter 4, "Cada módulo cierra con un examen".
   - Chapter 5, "La ruta entera, de un vistazo".
   - The example tabs keep four invented routes. They must not use real creators' names.
4. **The closing sheet keeps its blueprint figure and its field, with new jobs:**
   - the field asks "¿Qué quieres aprender?" and submits to the catalog search (`/es/explorar?q=`), so it works without JavaScript;
   - the idea buttons fill the field;
   - below it, the creators' block: "¿Enseñas algo que sabes bien?" with "Quiero enseñar".
5. **The STEP 4 parts that stay:**
   - "Rutas para empezar", the featured catalog routes, sits between the stage and the close, but only when there are featured routes;
   - the header and footer, restyled to match the stage.
6. **Delete the v2 landing hero and CSS that this replaces,** with their baselines. Re-record the baselines on CI. Reduced motion and no-WebGL each get their own baseline.

## §3. Every page gets one memorable thing

Read frontend-design's rule: spend boldness in one place per page, and keep the rest quiet.

**One visual language across every page, with no page a copy of the landing:**
- the route line is the signature;
- gold means "estás aquí", green means "hecho", plum means the action;
- the 3D appears only on the landing.

**Motion should be CSS first:**
- scroll-driven animations (`animation-timeline: view()` / `scroll()`), inside `@supports`, so that browsers without them get the static page;
- cross-document View Transitions (`@view-transition`) between storefront pages.

Verify current browser support for both, and say what Firefox and Safari do. All of it respects reduced motion.

**For each page, first write a short design plan in the PR, following frontend-design:** palette, type, layout and the one moment. Then build, then critique against the plan with screenshots. These are the reviewer's proposals; improve on them if you find better and say why.

| Page | Its moment |
| --- | --- |
| Catálogo | Each card's line is the route's real shape. On hover or focus it "travels": the line draws from start to end, and a gold dot runs it. Filtering by topic re-flows the grid with a View Transition. No fade-in on scroll for every card. |
| Página del creador | The hero is woven from the creator's own routes: their lines braided into one figure in the brand colour, drawn once on load. A creator with one route gets one bold line. |
| Página de la ruta | The vertical route of stations draws itself as you scroll, with a scroll-driven animation. The station passing the middle of the screen lights up, and the side card with "Empezar gratis" stays put. |
| Entrar / Revisa tu correo | The one place for a small delight: after "Enviar enlace", the line carries a dot to an envelope. Quiet otherwise. |
| Mis rutas | Each card's line shows real progress filled in green, and the "estás aquí" dot is gold. The first visit after enrolling animates that dot in once. |
| Quiero enseñar | The form is the whole page, calm and clear. Its moment is the confirmation: the applicant's request drawn as the first station of a new line. |
| Admin | No moment. It's a tool: dense, clear and fast. |
| STEP 5's screens (consent, Conexiones, Conecta tu asistente) | Consent shows the two ends joined by a line, your assistant and your Learning Routes, with what is allowed written along it. Otherwise quiet. |

**Every page must also pass:**
- the anti-slop and ui-polish checks;
- axe with no serious or critical violations;
- visible keyboard focus;
- no horizontal scroll at 390 px;
- touch targets of at least 44 px.

## §4. The design review loop

1. **For each page, the PR has three parts:**
   - the design plan;
   - before-and-after screenshots;
   - the motion recordings.

   Add your own critique: what you removed (Chanel's last accessory) and what still feels generic.
2. **Ask the owner for nothing directly.** The reviewer collects the recordings and puts them in front of him. Build so that each page's moment can be toggled off with one CSS class, so a rejected moment costs a small change, not a rebuild.

## Report, in one message

- **PRs:** each one, with its green run.
- **Recordings:** links to the screen recordings for each page.
- **The landing:** the v1 and new comparison pairs.
- **Budgets:** blocking and enhancement JS per page, and the Lighthouse numbers.
- **Browser support:** what you found for scroll-driven animations and View Transitions.
- **Copy:** every changed string, as links to the copy files.
- **Departures and questions:** every departure and its reason, and the questions for the owner.
