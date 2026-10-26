# STEP 43 — Batch 4: the learning experience, redesigned (design v2)

Paused on 26 October 2026: the learning experience is redesigned on the new platform (STEP 44 onward).

**Base:** `origin/main` after the "main green" PR (Tanda 0). Run it after STEP 42 (bugs first), unless the
owner says otherwise. **Written:** 23 October 2026 by the reviewer, the day the owner approved design v2.

**The reference** is twelve mockups the owner approved, copied to his machine (not committed, `tmp/` is
ignored): `tmp/redesign/step43/`. Each is one `.dc.html` file: plain HTML and CSS plus a small templating
layer (`{{holes}}`, `<sc-if>`, `<sc-for>`) and a `renderVals()` script. Read them for values, copy, layout
and states; do not port the templating. They are:

| file | page in the app |
|---|---|
| `Main.dc.html` | the lesson (step) page — the structure every lesson uses |
| `LeccionEscena.dc.html` | a lesson whose scene is an interactive model (the `simulation` section) |
| `LeccionMovil.dc.html` | the lesson at 390 px |
| `Examen.dc.html` | the module exam (assessments `take`) |
| `Atlas.dc.html` | the profile |
| `Desbloquear.dc.html` | a new page: unlock the next module |
| `CrearRuta.dc.html` | the route wizard (`route_wizard/new`): 5 steps and the "trazando tu ruta" moment |
| `CrearRutaMovil.dc.html` | the wizard's format step at 390 px |
| `VistaRuta.dc.html` | the route page (`learning_routes_engine/routes/show`) |
| `LeccionAudio.dc.html` | a lesson whose main section is audio (`content_engine/audio/*`) |
| `Comunidad.dc.html` | the community feed (`community_engine/feed/index` and its partials) |
| `Compartir.dc.html` | the share dialog (today inside `feed/_sidebar`) |

Batch rules (STEP 42): one branch `batch-4`, one PR, one commit per page (more if needed), red-first tests
for behaviour, renders before and after for every page, stop once.

---

## 0. What the owner chose (23 October)

1. **Light by default.** Dark only through the existing theme toggle. Scenes follow the theme too: a light
   "paper" stage in light, the dark plate in dark.
2. **Professional and ordered.** One top bar on every app page; one container width per page type; one
   type scale; one base card; one primary action per view; nothing decorative that does not carry
   information.
3. **The lesson is "el tramo".** A left outline lists the lesson's sections ("paradas") with their state
   (done, here, next) on a vertical line — the map's route, now an index. The content column is at most
   780 px wide. At ≤ 980 px the outline hides and a 5-segment strip shows progress instead.
4. **Scene block.** Stage + a player bar (play/pause, chapters with progress, time, speed, voice) + a
   caption line under it. Annotations are flat cards pinned on the stage with a colour dot, never covering
   the drawing.
5. **Model block.** For topics with a model (finance, maths, science): sliders in a strip under the stage
   recompute the chart and three result figures.
6. **Practice inline.** Options are large buttons with a keyboard hint (`1`, `2`…; the keys work).
   Right: the slot fills, a `+10 XP` chip, "Siguiente". Wrong: the reinforcement panel in teal with the
   map's dotted fan, the hint, and two actions: "Ver la escena otra vez" (scrolls to the scene) and
   "Intentar de nuevo". The one-round reinforcement rule (#91) stays as it is.
7. **The guide replaces the AI tools toolbar.** A card with the last exchange, suggestion rows and an
   input. The existing actions (explain differently, give an example, simplify, deepen) become suggestion
   rows. While the AI is off, the card says the guide is resting and links nothing that would fail.
8. **Arrival.** Correct answers, XP gained, time, the next topic and one primary CTA. Likes and comments
   move under it as one quiet line ("Lo que comentan otros (n)").
9. **Exam, "La cumbre".** Focused top bar (Salir · title · "Pregunta n de N" with a groove). Options 2×2 with
   letters. A segmented control "Lo sé / Creo que sí / Adivino". Right rail: the altimeter (one camp per
   question) and a question navigator.
10. **Profile, "Tu atlas".** Header (avatar, name, level, XP groove, "Nueva ruta"), four KPIs (rutas
    activas, temas hechos, minutos esta semana, racha), the resume card with its tray, the atlas plate
    (routes from "Tú", pinned labels, legend) with a route table under it, the week's bars and the stamps.
11. **Unlock page, "El siguiente tramo".** Completion banner, the next module's preview (lock, its topics
    on a line), the purchase card (the quote's price, "pago único", what it includes, one CTA, trust lines)
    and a short FAQ.

### Added on 23 October, after the owner's screenshots (proposals; the owner can veto them on the board)

12. **The wizard has 5 steps, not 6.** Tema, Nivel, Motivo, Tiempo, Formato. "Ritmo" stops being a step:
    it is derived from the weekly hours (2 h relaxed, 5 h steady, 10 h and 20 h intensive), shown on the
    Tiempo step, and stored in the same `pace` field. A summary card ("Tu ruta, hasta ahora") fills in
    as the student answers, with "Cambiar" on each answered line.
13. **The style quiz becomes "Formato", optional, 6 questions** (q1, q2, q4, q5, q6, q7 of today's 12;
    scoring unchanged). One question at a time, "Pregunta anterior", "Saltar este paso". It is framed as
    a preference for how the route mixes scenes, audio, reading and practice, not as "how you learn best";
    the result shows the mix as bars. Saved answers with 12 keys keep reading.
14. **The route page leads with "Continuar".** A hero with the current topic, the route's progress and a
    small map; the modules as stops; the danger zone moves into a "Más opciones" menu ("Eliminar ruta…"
    opens today's confirmation flow, unchanged).
15. **Community:** tabs "Para ti · Siguiendo · Populares"; milestone posts get "Felicitar"; a shared route
    shows "Ver ruta" and "Usar esta ruta" (today's clone).
16. **Share dialog:** opened from the route page and from Comunidad; the default is "Solo con enlace";
    it says what is shared and what is not.

### Glossary (one name per thing, everywhere in `es`)

ruta › módulo › tema. Kinds of tema: lección, lección de audio, lección con escena, práctica, repaso,
examen («la cumbre del módulo»). Also: refuerzo, guía, racha, XP, sello. Retired: "paso" as the unit,
"quiz", "clonar", "trending", "like", "feed".

### v3, 23 October evening: the same design, pushed further (the owner asked for "esteroides")

The twelve mockups were redone on one shared system. What changed, everywhere:

- **Type.** Display is Archivo at width 122 %, weight 800, tracking -0.038em (`.t-h1`), so titles read
  wide and confident. A second voice, STIX Two Text italic 500, carries the standfirst under each
  title, the scene captions, the guide's replies and the arrival line (`.t-voice`). Small labels are
  plain sentence case, Archivo 13 px 620 (`.t-label`): no uppercase, no tracked mono eyebrows above
  every heading. DM Mono stays only for timecodes.
- **Meta.** No "A · B · C" strings: meta is icon + phrase pairs (`.meta`), or a sentence.
- **The map sheet.** Each page opens on a header card with topographic contour lines and the route
  drawn through it, with "Estás aquí" (`.sheet`, `.sheet-art`, `.contour`, `.r-line`, `.r-rest`,
  `.n-done/.n-cur/.n-next/.n-ex`, `.map-lbl`). The contour art is four static SVG paths, generated
  once and checked in as a partial (`tmp/redesign/step43/contours.json` has them; ship them as files
  under `app/assets/images/contours/` or an ERB partial, not generated per request). Map labels are the
  one place with spaced capitals (cartographic convention). The route line draws once on page load
  (1.6 s), and not at all with reduced motion.
- **Stop markers.** Section titles carry a numbered stop (`.stopno`, done / current / next) only where
  the order is real; the guide gets a chat glyph and the arrival a flag, not a number.
- **The ticket.** Practice sits on a ticket with a perforated stub that holds "Frase n de 3" and the
  progress (`.ticket`, `.ticket-stub`). A right answer pops the slot and floats "+10 XP"; a wrong one
  shakes the options once and opens the reinforcement.
- **The seal.** Arrivals and milestones are stamped: a passport seal with the route on the top arc,
  "Módulo n · tema n" on the bottom arc, the topic in italic and the date (`.seal`, `.seal-in`).
- **A second route colour** for a second route on the same map: berry `--route2` (#A23B72 /
  #E88DBA). Teal stays reinforcement only.
- **Paid modules, everywhere they appear** (the owner: say it from the landing, see STEP 42 §5.8): the
  route map labels "Módulo 1 · gratis" and "Módulo 2 · de pago" with a dashed lock; the route page,
  the unlock page, the wizard's last step, the exam, Comunidad and the share dialog all say that the
  first module is free and the rest are paid, with the price shown before paying.

Per page, beyond the system:
- Lesson: the guide is a conversation (your question right, the guide's answer left in the serif
  voice), suggestions are chips without arrows, the input has a send button; the arrival shows the
  seal, three big figures and the next stop with its piece of route.
- Model lesson: "Antes de mirar: ¿cuánto crees que juntas?" asks for a bet before the curve (three
  chips; the answer says how close it was). Axis labels are HTML, not SVG text.
- Exam: the climb is a horizontal altitude profile across the top (ten camps, the summit flag); the
  question card is quieter; the navigator has a legend; a ghost of the first seal waits on the side.
- Atlas: the profile is the atlas plate itself (your routes leave from "Tú", tap a route in the legend
  to isolate it), then "Sigue donde lo dejaste", the week, your routes and a passport page of seals.
- Unlock: the map shows module 1 done and the gate to module 2 with a lock; paying opens the lock and
  draws the route into module 2.
- Wizard: a small map in "Tu ruta, hasta ahora" grows one segment per answered step; three idea chips
  under "Quiero aprender".
- Route page: title, meta and actions sit on the map sheet; "Sigue donde lo dejaste" is a bar under it.
- Audio lesson: "Pausa para repetir" (stops after each line so you can say it) and a "Repite" button on
  every transcript line; the Spanish line is in the serif voice.
- Community: the header shows the week's numbers; shared routes carry a contour mini map; milestones
  carry the seal.
- Share: the dialog shows "Así la verán", a live preview of the card others will see.

---

## 1. Foundations (first commit)

- **Tokens.** Where STEP 41 already has a token, keep its value (the mockups are within a shade). Add only
  what is new, in both themes, as tokens or `color-mix()`:
  `--color-surface-2` (light `#FAF8FB`, dark `#241A2F`), `--color-sunken` (`#F0EBF3` / `#1A1222`),
  `--color-signal-soft` (`#FDF3E1` / `#3A2C12`), `--color-reinforce-soft` (`#E7F4F2` / `#163330`),
  `--color-reinforce-text` (`#0F6A63` / `#5FD3C7`), and the stage set: `--stage-bg` (`#FCFAFD` / `#120B19`),
  `--stage-grid`, `--stage-ink`, `--stage-ink-2`, `--stage-route` (`#6A2EA0` / `#C9A2F7`), `--stage-signal`
  (`#C67F00` / `#F5B23C`). Values for the rest are in `Main.dc.html`'s `.lr` and `.lr.dark` blocks.
- **Theme default.** A visitor with no saved preference gets light. The existing toggle and the saved
  preference keep working; test both.
- **Type scale** (v3, from the mockups): label 13 px Archivo 620 sentence case; h1 `clamp(40px,4.3vw,60px)`
  weight 800 width 122 % tracking -0.038em; h2 `clamp(22px,1.9vw,27px)` 760 width 112 %; voice STIX Two
  Text italic 500 20/1.45; body 16.5/1.6; small 14. Tabular figures for numbers that line up.
- **Components** (on top of PR 4's): base card (1 px border + soft shadow), primary/secondary/ghost
  buttons, icon button, chip, `kbd`, groove, segmented control, and the v3 set: map sheet, stop marker,
  ticket, seal, the XP float. Each is one partial or one CSS class, used by every page. Option buttons keep the STEP 41 "body".
- **App top bar** as one partial for every app layout: brand, breadcrumbs (`content_for :breadcrumbs`),
  streak, XP, theme toggle, avatar.
- Tests: contrast check extended to the new pairs (text-3 on surface and bg, signal-text on signal-soft,
  reinforce-text on reinforce-soft, route-ink on route), 4.5:1 in both themes.

- **Retire the off-palette indigo.** `--color-section-audio-active` (#575BF0 / #818cf8) and
  `--color-highlight-violet` (#8B5CF6 / #A78BFA) map to the route tokens (`--color-accent`, its soft
  tint); the 21 literal `rgba(99,102,241,…)` in views (audio player and lesson, step badges, progress,
  the lesson stream partials) are replaced by tokens. Test: no view or stylesheet outside the token block
  contains `rgba(99, 102, 241`, `#575BF0` or `#8B5CF6`.
- **One icon family.** The emoji used as icons go: 23 in the wizard card (topics, goals, paces, 👋), the 🔒
  on locked modules, the style-result emoji. Use the line icons of the mockups (24 grid, 2 px stroke,
  `currentColor`, `aria-hidden`), through one partial (`shared/_icon`, by name). Test: the wizard, the
  route page and the community page render no emoji code points.

## 2. The pages (one commit each, in this order)

1. **Lesson** — `steps/show`, `_sidebar` (becomes the outline), `_step_content_frame`, `_navigation`,
   `_ai_buttons` (becomes the guide) and the `lesson_sections/*` partials. Every section partial renders
   an anchor id and a short title the outline lists; the outline's state comes from the step's progress.
   `motion`, `video` and `visual` sections render inside the scene block; the player's chapters come
   from the section's own beats or cues when it has them, otherwise the bar shows play/time only.
   `check`, `fill_blank`, `drag_drop` and the question partials get the practice styling and states of
   §0.6. Tests: the outline lists the sections and its links scroll to them; a wrong answer shows the
   reinforcement panel with both actions; key `1` picks the first option; the guide renders no broken
   action while the AI is off.
2. **Model block** — `lesson_sections/_simulation` inside the scene card with the controls strip of
   `LeccionEscena.dc.html`. Sliders are real `<input type="range">` with labels; results update without a
   request. Test: moving a slider changes the three figures.
3. **Exam** — `assessments/take` (and `results/show` aligned to the same shell). The confidence choice is
   stored with the answer if the model has a place for it; if it has none, add the column in this commit
   and say in the PR how review uses it today (or that it does not yet). Tests: the navigator marks
   answered questions; the confidence choice persists.
4. **Profile** — `profiles/show` and its partials into "Tu atlas". The atlas plate draws each of the
   student's routes from the journey data already used by the route cards' trays (no new queries per
   node; one query for all routes). Test: two routes render two lines with their current node.
5. **Unlock page** — the journey's "Desbloquear módulo" leads to a new GET page for that route and module.
   It shows the route quote's price when a quote can be built and posts to the existing `route_checkout`.
   When no quote can be built (no payment provider configured), it shows the module preview and a calm
   "Muy pronto" state instead of a price — never an invented number. The provider's name in the trust
   line and the refund answer come from locale keys the owner fills (`[pending]` until then). The FAQ text
   is in `Desbloquear.dc.html`. Tests: with a quote, the price and the checkout form render; without one,
   no price and no form.
6. **Phones** — the lesson at 390 px as `LeccionMovil.dc.html`: header with the 5-segment strip, the
   scene card, practice, and a sticky bottom CTA. 390 renders with CDP device emulation (STEP 39 §2b).

7. **Route wizard** — `route_wizard/new`, `_wizard_card`, `route_wizard_controller.js` as
   `CrearRuta.dc.html`. Layout: content column plus a 340 px summary card, sticky; one `h1` per step; the
   5-segment strip under the top bar. Steps: Tema (a labelled text field "Quiero aprender", the 12 areas
   as a radio group with icons, the route language as a segmented control), Nivel (4 options, keys 1–4),
   Motivo (6 cards, multi-select with `aria-pressed`), Tiempo (two segmented controls with today's values
   2/5/10/20 h and 15/30/60 min, a live sentence "5 h a la semana en sesiones de 30 min: unas 10 sesiones
   por semana." and the derived pace), Formato (§0.13). The primary button reads "Continuar", then "Trazar
   mi ruta"; when it cannot continue it says why next to it (never a silent disabled button). STEP 42 §5.1–5.3
   (one visible question, "Atrás" from locale, Back/Forward) stay green. The generating partial becomes
   the map that draws itself with four honest steps (no invented counts: the module count comes from the
   generated route) and "Suele tardar unos 30 segundos."; on failure, today's `_generation_failed` in the
   same shell, with the answers kept. Tests: the derived pace for each hours value; skipping Formato
   submits a balanced mix; the summary's "Cambiar" returns to that step with its answer.
8. **Wizard at 390** — `CrearRutaMovil.dc.html`: top bar with close ("Salir sin crear la ruta" as its
   accessible name) and "Paso n de 5", the strip, full-width options at least 56 px tall, a sticky bottom
   bar (Atrás, primary). Render at 390 with CDP device emulation and assert no horizontal scroll.
9. **Route page** — `routes/show`, `_step_item`, `_progress` as `VistaRuta.dc.html`. Header (back link,
   `h1`, meta line, a visibility chip: Privada / Con enlace / Pública), actions (Compartir, Ver el mapa →
   the journey, "Más opciones" menu with keyboard support and Esc). The hero: "Sigue donde lo dejaste" with
   the current topic, the route's progress (topics done of total) and "Continuar"; "Repasar antes (n min)"
   only when reviews are due. Modules as cards with stops (done, current, next, exam diamond) and the
   reinforcement hint under the current stop when the topic has one; a locked module shows only its
   description and "Desbloquear módulo n" (paid lesson details still never enter the response); the
   free one carries "Gratis" instead of "Vista previa gratuita". Side: reviews due (signal), this week, and
   the sharing card. Tests: the hero links to the first unfinished topic; a locked module renders no topic
   titles; the menu opens and closes with the keyboard.
10. **Audio lesson** — `content_engine/audio/_audio_lesson`, `_player` inside the lesson shell of page 1,
    as `LeccionAudio.dc.html`. The player: waveform-style progress (played part in the route colour, the
    playhead in signal), chapter chips with their time, play/pause (accessible name changes), ±10 s,
    time, speed, and a transcript that highlights the current line and seeks on click. "Iniciar Quiz"
    becomes a card "Comprueba lo que oíste" with "Empezar la práctica". Likes on a lesson become "¿Te sirvió
    este tema?" (Sí / No mucho) if the like model can carry it; if not, keep likes styled as in the mockup
    and say so in the PR. Comments collapse under "Preguntas sobre este tema (n)". Tests: the transcript
    line for the current time is marked; the quiz card links to the existing quiz route.
11. **Community** — `feed/index`, `_activity_card`, `_sidebar`, `posts/_post_form` as `Comunidad.dc.html`.
    Tabs are a real tablist; "Siguiendo" with nobody followed shows the empty state with one way out. The
    composer has a label (visually hidden) and stays disabled until there is text. Shared-route cards show
    a mini map from the route's modules, the rating, "Ver ruta" and "Usar esta ruta". The side: your shared
    routes, people with similar routes (STEP 42 §5.4 scope: real accounts only), this week's counts. Tests:
    the empty state on "Siguiendo"; demo accounts absent; follow toggles `aria-pressed`.
12. **Share dialog** — out of `feed/_sidebar` into its own partial used by the route page and Comunidad, as
    `Compartir.dc.html`. A native `<dialog>` opened with `showModal()`, `aria-labelledby` on the title,
    focus on the selected option when it opens and back on the opener when it closes, Esc and the close
    button ("Cerrar sin compartir"). Visibility is a radio group (Solo con enlace (default), Pública en la
    comunidad, Privada) with the existing values; the optional note is a labelled textarea with a live
    "n de 160"; the "Se comparte / No se comparte" box states what the code shares (check `RouteSharer`
    and Task 9 first; if the copy and the code disagree, the code wins and the PR says so). The button
    names the action ("Crear enlace", "Publicar en la comunidad", "Guardar como privada"); the success
    state shows the link with "Copiar enlace" → "Copiado" announced in a live region. Tests: focus moves in
    and returns; Esc closes; the default is the link option; copy announces.

## 3. Stop

All suites green from a clean tree (`env -u RAILS_MASTER_KEY`), numbers quoted. The PR description has, for
every page, the before and after renders in light and dark at 1440 and 390 (the wizard and the share dialog in each state), placed next to the mockup's
render, and lists anything that differs from the mockup on purpose.

## 4. Constraints, unchanged

Nothing in the repo, commits or PR bodies names any AI tool; the authorship check stays green. No key,
token or password is printed or pasted. Never `git add -A`; never commit `config/master.key`,
`config/credentials/*.key`, `.kamal/secrets` with values, `.claude/`, `node_modules` or any `.env`.
`env -u RAILS_MASTER_KEY` before `bin/rails test`. Every `kamal app exec` uses `-r job`. Screenshots
contain test data only. The deploy is the owner's, from his Mac. Merge nothing.
