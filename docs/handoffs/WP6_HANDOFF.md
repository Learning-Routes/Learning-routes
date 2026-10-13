# WP-6 handoff — the block contract is closed

**Branch:** `wp6-block-contract` · **Base:** `wp5-real-curricula` (`35eb02c`) · **Commit:** `0acbf08`
**Nothing was deployed.** Design rationale: `WP6_CONTRACT.md`. Deferred: `FINDINGS_WP6.md`.

**Result:** two real lessons generated through the live API — one language, one technical
— parsed and rendered by the real parser and renderer. **Zero `:::` markers survived.**
The model no longer emits any.

> 🔴 **Read `FINDINGS_WP6.md` §1 before trusting the audio story.** The ElevenLabs
> credential in production is an API key *ID*, not a key, so all text-to-speech is
> currently failing. That matters here because the replacement map hands the language
> family's listening practice to auto-narrated prose. The code path is verified working;
> the credential is not.

---

## 1. The contract

Five places declared the vocabulary and had drifted apart independently. PROMPT 04
named two of them; the other three are why this kept happening:

| Was | Now |
|---|---|
| `lesson_section_parser.rb:5` `BLOCK_TYPES` | derived from `LessonBlocks.fence_types` |
| `lesson_section_parser.rb:174-196` `HEADING_TYPE_MAP` | derived from `LessonBlocks.heading_map` |
| `markdown_renderer.rb:65-71` `INTERACTIVE_BLOCKS` | derived from `LessonBlocks.renderer_chrome` |
| `steps/_lesson.html.erb:128` — a **hardcoded inline array** | `LessonBlocks.known?` |
| the prompt YAMLs | validated against `LessonBlocks` by test |

**Single source of truth:** `ContentEngine::LessonBlocks`, in the engine that owns both
the parser and the renderer. The vocabulary is a property of what the app can render, so
the prompts conform to it rather than the reverse.

**Prompts are validated, not injected.** Full reasoning in `WP6_CONTRACT.md` §1; the
short version is that these files contain per-family exercise pools *with rationale*,
minimum requirements and hand-written syntax examples, none of which is derivable from a
constant. `AUDIT.md` §7 rates them as the best asset in the repo. A test that scans them
catches the same drift without making them generated and unreadable.

**Two leak sites, not one.** `markdown_renderer.rb:119` (`next _match`) is the one §A
names. The other is `lesson_section_parser.rb:68-70`, commented "Unknown block type —
treat as freeform text", and it is on the *primary* lesson path. Fixing only the renderer
would have left the main leak open.

**Failure mode: drop and log at `warn`.** Not a placeholder — a visible "this exercise
isn't available" in the middle of a paid lesson is worse than a slightly shorter lesson,
for a condition the student cannot act on. Not raise — one bad block would cost the whole
lesson. `WP6_CONTRACT.md` §3.

---

## 2. The replacement map

Ten dead types reassigned to six built ones. Per-family rationale in `WP6_CONTRACT.md` §4.

| Family | Dead | Replacement | Why |
|---|---|---|---|
| **Language** | `tap_pairs` | `## Match:` → `drag_drop` | Identical task: pair L2 with L1. Direct equivalent, keyboard-accessible. |
| | `word_bank` | `## Complete:` → `fill_blank` | Both test productive recall in a fixed frame. |
| | `translate_sentence` | `## Complete:` → `fill_blank` | Keeps production; the blank carries the tested item. |
| | `listen_and_type` | `audio` + `## Pregunta:` → `check` | Prose is auto-narrated; comprehension is checked rather than transcribed. |
| | `speak_sentence` | **not preserved** | No block captures speech. See §6. |
| **Programming** | `code_challenge` | `## Playground:` → `code_playground` | A real sandboxed editor that runs code against `expected_output`. |
| | `code_completion` | `## Playground:` (stub) | Same block, seeded with a stub. |
| | `terminal_exercise` | `## Playground:` | Same block. |
| | `bug_fix` | `## Playground:` (broken code) | The block already supports exactly this shape. |
| | `output_prediction` | `## Pregunta:` → `check` | "What does this print?" is multiple choice — and `check` gives immediate feedback, which `output_prediction` never did. |
| **STEM** | `drag_order` | `## Match:` + `## Complete:` | Partial loss — see §6. |
| **Design** | `image_label` | `## Visual:` + `## Pregunta:` | Image still renders; identification becomes a question. |

**The `## Heading:` surface was already correct** and is untouched — `lesson_content.yml`
already taught `## Match:`, `## Complete:`, `## Playground:`, `## Simulation:`,
`## Scenario:`, `## Flashcards:` and `## Visual:`, all of which have a parser branch, a
partial and a working controller. The entire defect was confined to the `:::` surface.
Bloom progression, prerequisite logic and subject-family branching are preserved.

---

## 3. Test counts

| Path | WP-5 end | WP-6 end |
|---|---|---|
| `bin/rails db:test:prepare test` (CI) | 126 runs, 0F 0E | **159 runs, 414 assertions, 0F 0E** |
| `bin/rails test test engines/*/test` (all) | 419 runs, **5F 9E** | **452 runs, 1238 assertions, 5F 9E** |

**The 14 engine failures are unchanged — not grown.** They remain `FINDINGS_WP2.md §1`,
for WP-4. `bin/rubocop`: 383 files, no offenses.

**33 new tests.** The contract test (17) asserts every link in both directions:

| Assertion | Catches |
|---|---|
| prompt `:::` types ⊆ parser vocabulary | the bug this package exists for |
| prompt `## Prefix:` ⊆ heading map | the same drift on the other surface |
| curriculum `exercise_types` all renderable | plans promising unbuildable exercises |
| parser emissions ⊆ declared types | a parsed section with no partial |
| declared types ↔ partials on disk (both ways) | missing partials, and orphan files |
| renderer chrome ↔ declared fence types (both ways) | renderer drift |
| every `data-action` resolves to a real method | the §7 property, pinned |
| no `:::` survives rendering — declared **and** undeclared | the leak, as behaviour |
| the ten dead types are named and must stay absent | a loud failure if one returns |
| identifiers well-formed and unique; prefixes unique | the `%w[]` class of mistake |

Both directions throughout, per the lesson in `WP5_HANDOFF.md` §4: a subset assertion
catches drift in one direction only, and the original failure was exactly a
one-directional gap.

---

## 4. The proof — real lessons, real parser, real renderer

Generated through `Orchestrate.call(task_type: :lesson_content)` against the live API,
then run through `LessonSectionParser.call` and `MarkdownRenderer.render`.

```
PORTUGUESE (language) — "Vocabulario básico y pronunciación inicial"
  cost 4¢ · 23.2s · 6714 chars
  section types (20): concept×5, visual×5, example×1, drag_drop×1,
                      fill_blank×2, flashcards×2, check×2, tip×1, summary×1
  ::: in the model's RAW output : none
  ::: surviving THE PARSER      : NONE ✓
  ::: surviving THE RENDERER    : NONE ✓
  section types with no partial : NONE ✓

RECURSION IN PYTHON (programming) — "Writing Recursive Functions for Classic Problems"
  cost 3¢ · 19.9s · 6162 chars
  section types (19): concept×5, visual×5, example×1, drag_drop×1,
                      fill_blank×1, code_playground×2, check×2, tip×1, summary×1
  ::: in the model's RAW output : none
  ::: surviving THE PARSER      : NONE ✓
  ::: surviving THE RENDERER    : NONE ✓
  section types with no partial : NONE ✓
```

Two things worth noting beyond the headline:

- **The model emitted no `:::` blocks at all.** The drop-and-log path is a safety net
  that did not need to fire — the prompt change alone stopped them being produced.
- **The replacement map is what the model actually used.** The language lesson reached
  for `drag_drop`, `fill_blank` and `flashcards`; the programming lesson reached for
  `code_playground` twice. `code_playground` is the strongest interactive block in the
  repo and the old prompt barely mentioned it.

**Spanish check** — 13 of 14 Spanish function words present; headings read
`## Concepto: Introducción al vocabulario básico en portugués`,
`## Visual: Imagen de objetos comunes con etiquetas en portugués`,
`## Ejemplo: Diálogo simple usando vocabulario básico`. The lesson is in Spanish, and the
`check` sections (its quizzes) are in the same body and therefore the same language —
which is the P1-5 fix landing.

---

## 5. Audio — what is verified and what is not

```
AudioStorage validated       : true
resolves under sections root : true
path traversal rejected      : true
audio section injected       : true
declared in LessonBlocks     : true
partial exists               : true
partial renders              : yes (18543 chars)
rendered references the url  : true
```

Everything from "a file exists at the sections path" through to "the audio player is on
the page" works, including the containment checks.

**Two things are NOT verified**, and neither is a code problem:

1. **Synthesis fails** — the production ElevenLabs credential is a key *ID*, not a key
   (`FINDINGS_WP6.md` §1). No narration is produced today, so the language family's
   listening story does not work in production until the credential is rotated.
2. **The shared volume cannot be tested locally.** There is no `web`/`job` split outside
   production for it to bridge. Commands for the production check are in
   `FINDINGS_WP6.md` §3.

---

## 6. What I left for WP-10

Server-side grading (`AUDIT.md` §P1-9) is untouched, per the scope boundary. Worth
saying plainly: **this package makes that gap less visible, not more.** The lessons now
render cleanly, so nothing on screen suggests the exercises report nothing to the server.
FSRS, XP and gap analysis remain starved.

Plus the capabilities the map could not preserve (`WP6_CONTRACT.md` §5): productive
speaking — the real loss, and a language course without it is diminished — sequence
ordering, and click-on-region labelling.

---

## 7. What surprised me

1. **Five declaration sites, not two.** The one nobody had catalogued was an anonymous
   `%w[...]` array inside `steps/_lesson.html.erb:128` that silently rewrote any unknown
   section type to `concept`. That is why unrenderable *parsed* sections degraded quietly
   instead of erroring, and it would have kept the contract drifting after a fix aimed
   only at the parser and renderer.
2. **Two leak sites, and §A names the less important one.** The parser's "treat as
   freeform text" is on the primary lesson path; the renderer's `next _match` serves
   agent replies, hints and `exercise` steps.
3. **The heading surface was already right.** I expected to rebuild both authoring
   surfaces. `lesson_content.yml` already taught all twelve heading forms correctly and
   every one was fully wired — so this turned out to be a smaller, cleaner change than
   the brief implies, and the "six built types the prompts never request" were in fact
   requested via `##` and merely never via `:::`.
4. **Finding a live production outage while checking a checkbox.** Phase 4 item 5 was
   meant to confirm WP-1's volume. It surfaced instead that TTS has been failing on an
   invalid credential — plausibly for as long as the credential has been in place, which
   would also mean `AUDIT.md` §P1-6's untracked ElevenLabs spend was never actually being
   incurred.
5. **`lesson_content` is timing out on its primary model on every call** and silently
   completing on the fallback — the same defect WP-5 fixed for `curriculum_design`, with
   the fix mechanism already in place and just not applied here (`FINDINGS_WP6.md` §2).
