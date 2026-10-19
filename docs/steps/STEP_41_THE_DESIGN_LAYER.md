# STEP 41 — The design layer: Ciruela, the annotated map, cards with body

Written by the reviewer on 19 October 2026 from the owner's picks. It replaces the placeholder that
STEP 39 §3 gave PR 4 and PR 5. Three PRs, in order: **PR 4** (foundations), **PR 5a** (the landing),
**PR 5b** (the app's pages). Stop for the reviewer after each one.

**The reference** is the approved mockup, saved on the owner's machine (not committed, `tmp/` is
ignored): `tmp/redesign/mapa-anotado/index.html`. To view it, serve that folder
(`ruby -run -e httpd tmp/redesign/mapa-anotado -p 8001`) and open `http://localhost:8001`.
It is one HTML file with plain JavaScript. Take its decisions, values and copy, not its structure:
in the app the code becomes Stimulus controllers plus pure modules under `app/javascript/lib/`,
tested under node like the journey modules. The theme toggle in its bar is the app's own toggle.
The "Las tarjetas de la app con Ciruela" section at its foot is the reference for PR 4 and PR 5b's
components, not part of the landing.

---

## 0. What the owner chose (14–19 October)

1. **Direction: "Mapa anotado".** The landing is the approved map (WP-37b's language) as a 3D scale
   model you travel by scrolling, and **the text lives on the map**: flat and legible, pinned to a
   free spot of the map so it travels with it, joined by a line to what it explains. It never covers
   the map, its names or the controls. He rejected text in perspective ("efecto 3D") and text that
   overlaps anything ("se sobrepone").
2. **Palette: Ciruela**, light and dark. It replaces today's cream and brown everywhere.
3. **Cards with body, not flat** ("los cards hazlos distintos, no planos"): a sheet with thickness,
   lit from above, a recessed tray, buttons you press.
4. **No question to answer on the landing.** The closing "¿Qué quieres aprender?" was redone.
5. Already decided elsewhere: the "4.8" claim goes (its own PR, already requested); the map on a
   phone opens legible and drags sideways (PR 2, #73).

---

## 1. PR 4 — Foundations

Branch from `main` after #73 merges. Nothing page-specific; layouts, navbar, footer and shared
components only.

### 1.1 Ciruela onto the existing tokens

Today's names stay (the colour sweep tests and `docs/design/palette.md` keep working). Light is the
`@theme`/`:root` value, dark is `html[data-theme="dark"]`.

| token | light | dark | from the reference |
|---|---|---|---|
| `--color-bg` | `#F5F2F6` | `#150E1C` | `--bg` |
| `--color-card` | `#FFFFFF` | `#241931` | `--panel` |
| `--color-txt` | `#1D1226` | `#F2ECF6` | `--ink` |
| `--color-sub` | `#4A3D54` | `#CDBFD8` | `--ink-2` |
| `--color-muted` | `#73667C` | `#9C8BAA` | `--muted` |
| `--color-faint` | `#D1C5D7` | `#44344F` | `--line-2` |
| `--color-border-subtle` | `#E4DCE8` | `#33263F` | `--line` |
| `--color-accent` | `#6A2EA0` | `#B98AF0` | `--route` |
| `--color-accent-text` | `#FFFFFF` | `#150E1C` | `--route-ink` |
| `--color-link` | `#57248A` | `#CAA4F5` | `--route-hover` |
| `--color-highlight` | `#E79A0F` | `#F5B23C` | `--signal` (stars, streaks, "Estás aquí") |
| `--color-progress-bar` | `#6A2EA0` | `#B98AF0` | `--route` |
| `--color-progress-track` | `#ECE6EF` | `#1C1325` | `--bg-2` |

New tokens, both themes:

| token | light | dark | use |
|---|---|---|---|
| `--color-accent-hover` | `#57248A` | `#CAA4F5` | primary button hover |
| `--color-accent-soft` | `#F0E5F8` | `#33224A` | level tag, selected row |
| `--color-signal-text` | `#9A6200` | `#F8C66B` | text in the signal colour |
| `--color-reinforce` | `#13807A` | `#46C2B6` | reinforcement (the map's dotted fan) |
| `--color-bg-2` | `#ECE6EF` | `#1C1325` | second surface, hover fills |
| `--color-edge` | `#DED3E3` | `#1C1325` | a card's thickness |
| `--color-shade` | `rgba(29,18,38,.18)` | `rgba(0,0,0,.55)` | card and button shadows |
| `--color-hi` | `rgba(255,255,255,.9)` | `rgba(255,255,255,.07)` | the lit top edge |

The other families keep their roles (palette.md rules): level accents NV1/2/3, semantic colours,
badges, status, flash, due. Check each against the new surfaces: text at least 4.5:1, UI parts
at least 3:1. **Any colour the owner did not name that has to change** goes in the PR description
as a light/dark screenshot pair; stop for his answer before changing it (the STEP 38 §3 rule).

### 1.2 Type

- **Archivo** replaces DM Sans in all four layouts (`landing`, `auth`, `learning`, `application`):
  `https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap`.
  The CSP already allows Google Fonts. DM Mono stays for code and timers.
- One `--font-sans` token. No view sets `font-family` inline any more. The auth and learning layouts
  do so today: move those to classes.
- Scale (clamp for display sizes):
  - display: 740 weight, `font-stretch:112%`, `letter-spacing:-.03em`, line-height .98;
    hero `clamp(52px,5.1vw,100px)`, section `clamp(42px,4vw,76px)`.
  - h2 `clamp(32px,2.75vw,54px)`, h3 22px, all 720–740 weight at 108–112% width.
  - body 17px, 420 weight, line-height 1.55; small 14.5px; labels 13px.
  - `font-variant-numeric: tabular-nums` wherever digits line up.

### 1.3 Shared components (values from the reference's CSS)

- **Card with body** (`.card3`): a vertical gradient on the surface, a lit top edge
  (`inset 0 1px 0 var(--color-hi)`), a 1px inner border, an 8px thickness (`0 8px 0 -1px var(--color-edge)`
  plus a hairline under it), and two shadows from `--color-shade`. On hover it rises 6px and the
  thickness grows to 12px. Cards you can act on also tilt up to 3° towards the pointer with a moving
  highlight. Only with `(hover: hover) and (pointer: fine)` and never with reduced motion.
- **Button with body**: a lit top edge, a 3px pressable edge in a darker mix of the accent, and a
  soft glow. Pressing drops it 2px. Secondary is the card surface with a line edge.
- **Tray**: a recessed well (inset shadow) for a route's mini-map. **Groove**: the progress bar,
  8px, recessed.
- **Chips and tags**: "Módulo N · Gratis" chip; tags Hecho (filled accent), Estás aquí
  (signal outline), Refuerzo (reinforce outline).
- **Inputs**: 1.5px line, 12px radius, 2px accent focus ring.
- The `rgba()` tints written by hand next to tokens become tokens or `color-mix()` (STEP 39 PR 4).
- **One icon language** through `svg_icon`: 24px grid, stroke 1.75–2, round caps and joins.

### 1.4 Tests (red first where they guard a rule)

- The existing colour sweeps keep passing.
- New: no view or layout sets `font-family` inline; every layout loads Archivo.
- New: a contrast check that reads the tokens from `application.css` and asserts 4.5:1 for
  txt/bg, txt/card, sub/card, accent-text/accent and link/card, in both themes.
- Renders before and after: navbar, footer, the auth card and one card of each kind, light and
  dark, at 1440 and 390, next to the reference.

---

## 2. PR 5a — The landing is the annotated map

From `main` after PR 4. The landing becomes exactly the reference: **nav, the pinned stage (hero plus
five chapters), the closing sheet, the footer**. Everything else on today's landing goes: `_hero`,
`_product_preview`, `_how_it_works`, `_path_section` (and `path_viz_controller.js`, only the landing
uses it), `_outcomes`, `_features`, `_integrations`, `_cta`, with their locale keys. PR 1's test that
every provider the landing names is routable has nothing left to check. Replace it with one
asserting the landing names no AI provider.

### 2.1 The stage

- **three.js**, an exact version pinned in `config/importmap.rb` from jsdelivr (`three.module.min.js`;
  the CSP already allows it). Imported lazily (`await import`) by the landing's controller only.
  The reference uses r128's UMD build: port to the module build and its colour management
  (`outputColorSpace`).
- **The model** is WP-37b's map:
  - three module sheets with thickness and corner ticks, the last one locked and translucent;
  - curved legs (K = .55), U-turns at the gutter, chevrons;
  - the dotted reinforcement fan from step 3, the exam diamond, the origin marker, the module discs.
  - Geometry constants are in the reference (`SX`, `GUT`, `MODDEF`, `ITIN`).
  - Colours come from the tokens through `getComputedStyle`, read again on a theme switch.
- **The scroll story**: chapter weights `[1.1, 1.5, 1.6, 1.5, 1.8, 1.4]`, one resting camera per
  chapter (`CAMS`, with a phone framing), camera moves only in the last 28% of a chapter.
  - Chapter 1: the route sweep.
  - Chapter 2: the pin walks steps 1→3.
  - Chapter 3: the reinforcement fan rises.
  - Chapter 4: the exam and the jump to module 2, with the done ring.
  - Chapter 5: the whole route.
  - The four example routes (tabs) change the names on the map.
  - Lens: FOV 22.

### 2.2 The text on the map (the owner's main point; treat overlaps as defects)

- Each chapter's text is **server-rendered HTML** (h1 in the hero, h2 per chapter, a paragraph,
  the hero's button). The controller pins it to a world point on the sheets' plane and moves it
  with the map each frame. It never tilts.
- **Where it sits**: a pure module, `app/javascript/lib/landing_placement.js`, run at each chapter's
  resting camera for the current viewport.
  - Inputs: the obstacles and the text's shape. The obstacles are every stop with the space for
    its name, the module discs and chips, the root title, samples along every leg and the fan,
    the sheets' edges, the stage's controls, and a clearance around the anchor. The shape is two
    boxes, headline and body, not one rectangle.
  - Output: the free slot nearest the designed one.
  - If no slot near the designed one is clear, **the camera gives way**: distance ×1.0 to ×1.55 and
    small slides, until the spot is clear.
- **The line**: a cubic (K = .55) from the end of the headline, or from under the text, to the
  anchor, ending in a ringed dot. It follows the pin in chapter 2.
- **Names on the map** are placed by priority:
  1. the current step;
  2. the chips and the root title;
  3. module names;
  4. step names;
  5. reinforcement names.

  A name never covers another name or the text; it waits instead.
- **Node tests** for the module, using the real geometry: zero overlap for every chapter at
  1440×900, 1280×720, 1024×768, 1920×1080, 768×1024 and 390×844. The reference reaches zero
  everywhere except 360×740's hero (4 points); fix that one.

### 2.3 The closing sheet

- A card with body and corner ticks.
- **Left column:** the question, the intro line, and the field with its button.
  - Below it, ideas that fill the field: Portugués para viajar, Python desde cero, Guitarra para
    empezar, Finanzas personales.
- **Right column:** a blueprint of an empty route: three dashed module sheets, ghost stops, and
  "Módulo 1 · Gratis".
  - Focusing the field makes the dotted lines flow.
  - Submitting draws the first module and puts the typed topic on its chip.
- **Where it goes:**
  - Signed in: `new_route_wizard_path(topic: …)`.
  - Signed out: sign-up, keeping the topic in the session, and the wizard after sign-up.
  - The wizard reads `topic` and pre-fills its first question. It reads no params today, so add
    that, with tests.

### 2.4 Copy (both locales; module and step names of the four example routes translate literally)

| key | es | en |
|---|---|---|
| hero title | Aprende lo que quieras, bien. | Learn anything, the right way. |
| hero line | Learning Routes lo convierte en una ruta: módulos en orden, temas cortos con práctica y un examen al cerrar cada módulo. | Learning Routes turns it into a route: modules in order, short topics with practice, and an exam to close each module. |
| hero button / note | Crear mi ruta · El primer módulo es gratis. | Create my route · The first module is free. |
| ch1 | Tu ruta, armada para ti — Nos dices qué quieres aprender y cuánto sabes. La ruta se arma en módulos, cada uno con sus temas en orden. | Your route, built for you — Tell us what you want to learn and how much you know. The route is built in modules, each with its topics in order. |
| ch2 | Un tema a la vez — Lees, practicas y respondes una comprobación. Al acertar, el tema queda hecho y la línea avanza contigo. | One topic at a time — You read, practise and answer a check. Get it right and the topic is done; the line moves on with you. |
| ch3 | Si algo cuesta, aparece un refuerzo — Fallar una comprobación abre temas cortos de refuerzo debajo de ese tema. Al terminarlos, sigues por la ruta. | If something is hard, a reinforcement appears — Missing a check opens short reinforcement topics under that topic. Finish them and you carry on along the route. |
| ch4 | Cada módulo cierra con un examen — Confirma lo que sabes y pasas al siguiente módulo de tu ruta. | Every module ends with an exam — Confirm what you know and move on to the next module of your route. |
| ch5 | Tu ruta entera, de un vistazo — Módulos en orden, cada uno con sus temas y sus refuerzos. El primer módulo es gratis. | Your whole route at a glance — Modules in order, each with its topics and reinforcements. The first module is free. |
| map UI | Ruta de ejemplo · Hecho · Estás aquí · Por llegar · Refuerzo · Bloqueado · Tu ruta · Módulo N · N de M · N temas · Gratis | Example route · Done · You are here · Coming up · Reinforcement · Locked · Your route · Module N · N of M · N topics · Free |
| tabs | Portugués · Python · Guitarra · Finanzas | Portuguese · Python · Guitar · Finance |
| closing title | ¿Qué quieres aprender? | What do you want to learn? |
| closing line | Escríbelo con tus palabras, como se lo contarías a un amigo. Con eso armamos tu ruta, módulo a módulo. | Say it in your own words, the way you'd tell a friend. We build your route from that, module by module. |
| field / ideas | Por ejemplo: inglés para el trabajo · Ideas: | For example: English for work · Ideas: |
| blueprint | Tu ruta aparecerá aquí. — Módulos en orden, cada uno con sus temas. El primer módulo es gratis. | Your route will appear here. — Modules in order, each with its topics. The first module is free. |

### 2.5 Fallbacks, access, speed

- **No WebGL**: no canvas; the chapters stack as plain text in order, with the closing below.
- **Reduced motion**: no smoothing, each chapter shown at its end state, no tilt, no flowing lines,
  no write-on.
- **Keyboard**: the chapter dots are buttons; inactive chapters' links get `tabindex="-1"`. The canvas
  is `aria-hidden`; the text stays in DOM order. Visible focus everywhere.
- **Speed**: the text is HTML and paints before three.js loads. Pixel ratio is capped at 2 (1.5 on
  touch). The loop pauses off-screen. The loop restarts on scroll without waiting for the
  IntersectionObserver: the reference had a bug where jumping back to the top left the hero empty.
- The landing's cache key (PR 1) still covers locale, theme and session.

### 2.6 Tests and renders

- System tests:
  - Both locales render the six texts.
  - The canvas mounts.
  - With reduced motion, chapter 2's text is visible after one jump.
  - An idea fills the field.
  - Submitting carries the topic: signed in to the wizard, signed out through sign-up to the wizard.
  - The landing names no AI provider.
  - "4.8" never renders.
- Node tests: `landing_placement.js` (§2.2).
- Renders of chapters 0–5 and the closing at 1440, 1280 and 390, light and dark, next to the
  reference. Anything that differs from it is a defect unless the PR says why.

---

## 3. PR 5b — The app's pages on the foundations

From `main` after PR 5a. One commit per page, renders before and after for each:

1. **Route cards** (profile and wherever they appear): the reference's card.
   - Level tag and module count, title, current module and topics done.
   - The mini-route in a tray: done stops filled with a check, the current one ringed in the
     signal colour, the rest outlined.
   - The groove and Continuar.
   - The "Sigue donde lo dejaste" card.
2. **Community feed**, **lesson page**, and **the journey**, aligned once PR 2 has merged.
3. Then the rest:
   - dashboard, wizard, settings, sign-in and sign-up;
   - the public shared route, exams, notifications;
   - STEP 36 §5's three public pages on the new layout.

Too big to review as one? Say so when the first four pages are done. The split stops at 5a/5b
(STEP 39).

---

## 4. Order

#73 green and merged → the "4.8" PR → **PR 4** → **PR 5a** → **PR 5b**. PR 3 (SEO) can land in between.
Dependabot and the branch clean-up run when the reviewer says, after #73.

## 5. Constraints, unchanged

- Red first.
- `env -u RAILS_MASTER_KEY` before `bin/rails test`.
- Screenshots with test data only (the repo is public).
- No `git add -A`.
- No commit, PR or file names a tool as author: no Co-Authored-By, no "Generated with".
- Deploys stay with the owner, from his Mac.
- Stop for the reviewer after each PR.
