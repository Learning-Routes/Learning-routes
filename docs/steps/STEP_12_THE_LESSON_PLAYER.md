# STEP 12: The lesson player

Written by the reviewer, 14 November 2026. Repository: `Learning-Routes/platform`. This STEP runs alongside STEP 11 (media and credits); the two touch different files.

## 0. Context

Today a lesson is a page to read (`apps/web/app/routes/seguir.tsx`, "Reading only"). Exercises are shown, not answered. `core/learning/grader.ts` grades three types, but no action calls it and nothing records an answer.

This STEP turns the lesson into a **player**: one beat per screen, every exercise answered and graded on the server, a feedback sheet after each answer, progress that is saved, and simulators for each subject (a piano for piano, a fretboard for guitar, an ammeter for electricity). The owner approved the design on a canvas of 70 artboards. The parts you need are in `docs/design/reference/player/`:

- `ref-mobile-questions.png`, `ref-mobile-simulators.png`, `ref-desktop.png` and `ref-dark.png` are the approved renders.
- `artboards/*.dc.html` are the prototype sources. Each holds its markup, its styles and the state logic in a `class Component`. Read them as a spec, not as code to copy: they are mockups with inline styles, and our CSP forbids inline styles.

**The design rules the owner insisted on. They are not optional:**

1. **One system for every route.** One neutral base (paper, surface, ink, greys), one type scale, one skeleton per screen: header → eyebrow → title → stage → footer action. No per-route palettes.
2. **One accent, and the creator chooses it.** The system normalizes any colour to a fixed lightness and chroma, so every creator's colour looks like the same product and passes contrast. Light: `oklch(from var(--brand) 0.53 0.17 h)` with white text. Dark: `oklch(from var(--brand) 0.78 0.14 h)` with near-black text. Soft tint: `color-mix(in oklch, var(--accent) 11%, var(--surface))` (16% in dark mode).
3. **Illustrations use only the neutrals and the accent.** Change the colour and the whole simulator changes. The colour wheel is the one exception, because colour is its subject.
4. **Light and dark** follow the existing theme switch (`theme.ts`, `theme-toggle.tsx`).
5. **Motion with intent.** The feedback sheet slides up. A right answer pops with a ring and "+10 XP"; a wrong one shakes. Options enter staggered. All of it is off under `prefers-reduced-motion`.

## Batch rules

- Five PRs, in the order below. Each STEP section lists who builds it. PRs 3 and 4 are frontend that the reviewer builds and hands over as patches; Code reviews them, brings them up to `main`, and owns CI.
- One branch per PR from `origin/main`. This STEP file is the first commit of PR 1.
- Same rules as before:
  - no tool or AI attribution anywhere;
  - no secrets;
  - exact pins, and the newest release at least 14 days old;
  - no skipped or weakened tests;
  - every fix starts with a test that fails;
  - measured budget numbers go in each PR description.
- `core` stays pure. Graders are pure functions of the block and the submission.
- Read the `lr-data-and-tenancy`, `lr-performance-budget` and `lr-ai-cost-guard` skills before PRs 2 and 3.

## PR 1 (Code): the vocabulary

Extend `packages/core/src/blocks/{types,schema}.ts` (and the v1 import builder that shares them). Every schema stays strict. Text fields are `LocalizedText`.

| Type | Fields | Gradable | Gating | Submission → grade |
| --- | --- | --- | --- | --- |
| `check` (exists) | add optional `why` per option: the explanation shown when that wrong option is picked | yes | yes | unchanged |
| `order` | `prompt`, `items` (2–8, in the correct order), `explanation?` | yes | yes | `{ order: number[] }`, a permutation. Correct when it is the identity; score = items in place / n |
| `drag_drop` (exists) | add optional `left_label` and `right_label` | yes | yes | unchanged |
| `fill_blank` (exists) | add optional `choices` (a word bank with distractors) | yes | yes | unchanged |
| `true_false` | `statements`: 2–10 of `{ text, answer: boolean, why? }` | yes | yes | `{ answers: boolean[] }`; score = right / n; correct when all are right |
| `estimate` | `prompt`, `min`, `max`, `step`, `unit?`, `answer_min`, `answer_max`, `anchors?`: `{ value, label }[]`, `explanation?` | yes | yes | `{ value }`; correct inside `[answer_min, answer_max]` |
| `hotspot` | `prompt`, `image_url` (the content host) or `diagram` (the name of a built-in diagram), `spots`: 2–8 of `{ x, y (0..1), label, correct }`, `explanation?` | yes | yes | `{ spot: number }` |
| `worked_example` | `problem`, `steps`: 1–8 of `{ label, work (plain string), why }` | no | no | none |
| `speak` | `phrase` (plain string, in the target language), `lang` (BCP 47), `translation?` | no | no | none (speech scoring is a later STEP) |
| `code_check` | `language` (`"javascript"` only for now), `starter`, `tests`: 1–6 of `{ call, expected }`, `hint?` | no (it runs in the browser) | no | none; the client runs the tests in the creation sandbox |
| `open_answer` | `prompt`, `rubric` (1–5 criteria), `model_answer?` | yes (by the tutor, see PR 2) | no | `{ text }` |
| `video` (exists) | add `chapters?`: `{ at: seconds, title }[]` | no | no | none |
| `sim` | `kind` + `prompt` + `explanation?` + the kind's own params (below) | depends on the kind | when gradable | `{ state }`, graded by the kind |

**`sim` kinds.** A discriminated union, one schema and one pure grader each. Each grader recomputes the goal from the submitted state and never trusts a client flag.

- `piano_chord`: `{ target: pitch classes 0–11, low: midi, high: midi }`. Correct when the submitted set of MIDI notes has exactly the target pitch classes and no others.
- `guitar_chord`: `{ target: { [string 1–6]: fret 0–5 } }`. Correct on an exact match; open strings are left out.
- `camera_exposure`: `{ scene_ev, min_shutter_denominator? }`. The state is `{ aperture, shutter, iso }`, taken from fixed lists. Correct when `|scene_ev − (log2(N²/t) − log2(iso/100))| ≤ 0.5` and the shutter is fast enough.
- `compound_interest`: `{ rate, years, goal, min, max, step }`. The state is `{ monthly }`. Correct when the future value is at least `goal`.
- `css_flex`: `{ target: { justify, align } }`. Correct on an exact match.
- `fraction_pie`: `{ parts, target }`. Correct when the count of selected parts equals `target`.
- `ohm`: `{ target_amps, v: [min, max], r: [min, max], tolerance }`. Correct when `|V/R − target| ≤ tolerance`.
- `equation_balance`: `{ terms: { formula, atoms: { [element]: count }, side: "left" | "right" }[], max: 6 }`. Correct when every element balances. Any balancing multiple is accepted; the feedback says when it is not the smallest.
- `chess_mate_in_one`: `{ fen, solution }` (UCI, for example `a1a8`). Correct when the move equals the solution. No chess library: the client only highlights the moves of the piece the creator marks movable. That list is derived from the FEN and a small rule set for rook, queen, bishop, knight and king, unit-tested.
- `color_wheel`: `{ base: 0–11, relation: "complement" | "analogous" | "triad" }`. Correct by hue arithmetic.
- `roleplay`: `{ lang, turns: 1–5 of { line, choices: 2–4 of { text, score 0–2, note, reply } } }`. The state is the chosen indices. Score = sum / (2 × turns); correct at ≥ 80%.
- `cpr_rhythm`: `{ min_bpm: 100, max_bpm: 120, count: 15 }`. Engagement only; the client measures the timing.
- `step_sequencer`: `{ bpm, rows: { name, steps: number[] }[], challenge? }`. Engagement only.

Also in PR 1:

- Fences for authors writing Markdown (`:::order`, `:::true_false`, `:::estimate`, `:::hotspot`, `:::worked_example`, `:::speak`, `:::code_check`, `:::open_answer`, `:::sim`). Each one gets a parser test in English and in Spanish.
- `answerable()` for every new gating type.
- `get_route_format` and the MCP docs list every new type with a short example. The creator's assistant will write them in PR 5.
- `routes.accent_color` (nullable). When it is null the route uses the space's `brand_color`. Same hex format and check; `checkBrandColor` stays the single validator. The tenancy test covers it.
- Tests: one golden case per grader (right, wrong, partly right, malformed submission → ungradable), and a property test that no grader throws on any JSON input.

## PR 2 (Code): answering, progress and the tutor's review

- The action `lesson.answer`: `{ enrollmentId, blockId, submission }`. It loads the block on the server, calls `grade()`, and stores an attempt in a new `attempts` table (enrollment, block, submission JSON, correct, score, created_at), with the same ownership checks as `lesson.read`. It returns `{ correct, score, explanation, why? }`. The explanation is the block's `explanation`, or the chosen option's `why`.
- XP: +10 for a correct first try and +5 after a retry. `progress` keeps the per-topic total. Gating: a topic completes when every gating block has at least one correct attempt. `lesson.read` returns the player's state: which blocks are answered, and the next beat.
- Review: every wrong gradable answer goes into the existing FSRS `cards` and `reviews` flow, keyed by block. The action `review.today` returns the due items grouped by route.
- `open_answer`:
  - It goes through the `core/ai` gate with the tutor model (Haiku, the price in `models.ts`), max 400 output tokens, and the budget from `lr-ai-cost-guard`.
  - Output: a JSON verdict per rubric criterion plus one sentence of feedback, validated with zod.
  - On no credit or an error, the answer is saved with `correct: null` and a calm "your tutor will review it later". Never a blank screen, never a fake grade.
  - The learner's text is untrusted input: wrap it in the fenced untrusted-data markers.
- Rate limits on `lesson.answer`, like the other learner actions.
- Tests: an attempt by another user's enrollment is refused; double submits are idempotent within 2 s; the open-answer path works with a fake model and with the gate saying no.

## PR 3 (reviewer → Code): the player

The reviewer builds this and hands it over as a patch against PR 2's API. Its shape, so the API serves it:

- **Route:** `mis-rutas/:enrollmentId/tema/:n` renders the player. The reading page stays as the "read everything" view behind a link.
- **Beats:** each block is one screen. Content blocks (`concept`, `example`, `tip`, `summary`, `visual`, `video`, `audio`, `worked_example`, `speak`, `interactive`) end in "Continuar". Gradable blocks end in "Comprobar", then the sheet.
- **Skeleton:**
  - **Header:** close, progress bar (beat n of N), `n / N`, and the tutor button.
  - **Eyebrow:** the route mark and name, then the beat kind.
  - **Title:** 28 px on a phone, 38–40 px on desktop.
  - **Stage:** one surface with radius 24 and the hairline border.
  - **Footer:** one primary action, 56 px tall.
- **Feedback sheet:**
  - right: success tint, check, "+10 XP";
  - wrong: surface colour, the error title, the explanation, then "Reintentar" or "Corregir" (which keeps the right parts) and "Continuar".
- **Desktop (≥ 1024 px):** three columns. The module outline (272 px) and the tutor panel (340 px: conversation, suggestions, input) flank a centre column of at most 760 px. The header gains a theme button. The feedback bar shows the explanation on the left and the actions on the right.
- **Theme:**
  - `--brand` comes from the existing `/_brand/<hex>.css` route, extended to emit the normalized accent tokens in both themes.
  - Add an `@supports not (color: oklch(from red l c h))` fallback that uses the raw brand.
  - No inline styles. Dynamic values (positions, the needle angle, widths) go through refs and `style.setProperty`, as the studio already does.
- **Keyboard:** A–D pick an option, Enter checks, Esc closes the sheet. Each control is a real `<button>` or `<input>` with a label. Targets are at least 44 px.
- **Budgets:** the player route counts against "app entry + one route" (150 KB, or baseline + 10%). Simulators are not in it (PR 4).
- **Module close:**
  - a score ring that fills and counts up;
  - stats (time, XP, modules);
  - the topics to review, linking to their beats;
  - confetti from the accent and the neutrals, skipped under reduced motion.
- **Daily review:** the review screen lists the due items by route; each route can be toggled on or off.

## PR 4 (reviewer → Code): the simulators

- One component per `sim` kind, each one a lazy chunk of at most 15 KB gzip. They are loaded only when a beat needs them. No new dependencies.
- **Sound:** Web Audio only, started from a user gesture. The piano uses layered oscillators; the guitar uses Karplus-Strong; the sequencer and the CPR metronome use synthesized clicks. Speech uses `speechSynthesis` with the block's `lang`, where it exists, and is hidden when it does not.
- **`code_check`:** the tests run in the existing creation sandbox on the content host, never on the app origin.
- The `hotspot` built-in diagrams ship as SVG components that use the theme tokens. The brake is the first one.

## PR 5 (Code): the assistant writes them

- The studio's planner and writer can pick the new types: at least one practice beat every three content beats, and a `sim` when the subject has a kind.
- The scripted journey tests cover one route of each kind, a broken `sim` (rejected by the schema and repaired once), and the cost ledger.
- `lr-ai-cost-guard`: give the new prompts' sizes in the PR description.

## Verification (each PR)

1. `pnpm check` green, with the budget numbers in the description.
2. **PR 3 and PR 4:**
   - Screenshots at 390 × 844 and 1440 × 900, light and dark, and in two creator colours. Compare them against the reference PNGs.
   - A keyboard-only run through one lesson.
   - Reduced motion checked.
3. **PR 2:** a local end-to-end run: answer wrong, retry, see the XP move, find the item in `review.today`.
