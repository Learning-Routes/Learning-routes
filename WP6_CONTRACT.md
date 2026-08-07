# WP-6 Phase 2 — the block contract

Design decisions, made before writing code.

---

## 0. What I found that changes the framing

PROMPT 04 describes two surfaces. There are **five** places the block vocabulary is
declared, and they have all drifted independently:

| # | Location | Declares |
|---|---|---|
| 1 | `lesson_section_parser.rb:5` `BLOCK_TYPES` | which `:::type` fences the parser understands (11) |
| 2 | `lesson_section_parser.rb:174-196` `HEADING_TYPE_MAP` | which `## Prefix:` headings map to which type (21 prefixes → 12 types, bilingual) |
| 3 | `markdown_renderer.rb:65-71` `INTERACTIVE_BLOCKS` | which `:::type` fences render to HTML (5) |
| 4 | `steps/_lesson.html.erb:128` | a **hardcoded inline array** of which types have a partial (14) |
| 5 | `lesson_content.yml`, `curriculum_design.yml` | what the model is told to emit |

Number 4 is the one nobody has mentioned. It is an anonymous whitelist inside an ERB
line that silently rewrites any unknown section type to `concept`. It is the reason
unknown *parsed* sections degrade quietly instead of erroring.

**There are also two independent leak sites, not one:**

- `markdown_renderer.rb:119` — `next _match unless config` returns the raw `:::` text
  (this is the one §A names).
- `lesson_section_parser.rb:68-70` — `segments << { block: false, text: match[0] }`,
  commented "Unknown block type — treat as freeform text". Same leak, different path,
  and it is the one that fires on the *lesson* rendering path.

Fixing only the renderer would leave the primary path leaking.

**Good news that narrows the work:** the `## Heading:` surface is already aligned.
`lesson_content.yml` already instructs `## Match:`, `## Complete:`, `## Playground:`,
`## Simulation:`, `## Scenario:`, `## Flashcards:`, `## Visual:`, and every one has a
parser branch, a partial and a controller. **The entire defect is confined to the
`:::` surface**, where the prompt requests 11 types and the parser knows one of them
(`flashcards`).

---

## 1. Where the single source of truth lives

**`ContentEngine::LessonBlocks`** — a new module in `content_engine`, which already owns
both the parser and the renderer.

It declares one entry per supported section type: its `:::` fence name (if authorable
that way), its heading prefixes, whether it has a partial, and its renderer chrome.
Consumers 1-4 above derive from it; none keeps its own list.

Why `content_engine` and not `ai_orchestrator`: the vocabulary is a property of what the
*app can render*, not of what the model is asked for. The prompts must conform to the
renderer, not the other way round.

### Prompts: validated, not injected

The prompt YAMLs are checked against `LessonBlocks` by a test. The vocabulary is **not**
templated into them at build time. Reasons, in order of weight:

1. **Injection would destroy the pedagogy.** These files do not contain a list of block
   names; they contain per-family exercise *pools with rationale* ("The lesson should
   FEEL like a Duolingo unit", "read → predict output → complete → fix bugs → write from
   scratch"), minimum requirements ("at least ONE listen_and_type OR speak_sentence"),
   and a hand-written syntax example for every block. None of that is derivable from a
   constant. `AUDIT.md` §7 rates these as the best asset in the repo; a generated list
   would replace judgement with enumeration.
2. **A prompt you cannot read is a prompt you cannot improve.** These are edited by
   hand and reviewed in diffs. ERB-templating them makes both worse.
3. **Validation catches the same drift, earlier and more cheaply.** A test that scans
   the YAML for `:::name` and asserts membership fails in CI with a precise message, at
   zero runtime cost and with no build step.

The trade-off is that adding a block type requires editing the prompt by hand. That is
correct: a new block needs a worked syntax example and a pedagogical home, which is
exactly the thinking a build step would let you skip.

---

## 2. What the contract test asserts

Both directions on every link, per the lesson recorded in `WP5_HANDOFF.md` §4 — subset
assertions are one-directional and a superset full of junk still passes.

| # | Assertion | Catches |
|---|---|---|
| 1 | every `:::type` in `lesson_content.yml` ∈ `LessonBlocks.fence_types` | the current bug: prompts requesting unrenderable blocks |
| 2 | every `## Prefix:` in `lesson_content.yml` ∈ `LessonBlocks.heading_prefixes` | the same drift on the heading surface |
| 3 | every `exercise_type` in `curriculum_design.yml`'s vocabulary maps to a renderable block | CurriculumBrain planning exercises that cannot be built |
| 4 | `LessonBlocks.fence_types` == `LessonSectionParser::BLOCK_TYPES` | parser drift |
| 5 | every type the parser can emit has a partial file on disk | a parsed section with no way to display it |
| 6 | every type with a partial is in the `_lesson.html.erb` dispatch list | silent degradation to `concept` |
| 7 | every `:::` type renderable by `MarkdownRenderer` ∈ `LessonBlocks` and vice versa | renderer drift |
| 8 | every `data-action` in every partial resolves to a real Stimulus method | the §7 property that already holds, pinned so it keeps holding |
| 9 | every declared type is a well-formed identifier, and the list is unique | the `%w[]`-comment class of mistake from WP-5 |
| 10 | no `:::` marker survives rendering for any declared **or undeclared** type | the leak itself, asserted as behaviour |

Every failure message names the offending type and which link is missing.

---

## 3. Unknown-block failure mode

**Decision: drop the block from output, and log at `warn`.**

Rejected alternatives:

- *Render the raw `:::` text* — the current behaviour, and the bug.
- *Render a neutral placeholder* ("This exercise isn't available") — visible admission of
  breakage in the middle of a paid lesson, for a condition the student cannot act on.
  Worse than a slightly shorter lesson.
- *Raise* — one bad block would cost the whole lesson, and the model produces the body in
  a single generation. Far too brittle.

Dropping keeps the lesson coherent, and the `warn` line makes the drift visible to us
rather than to the student. The contract test is what stops it happening; the drop is the
safety net for when it does anyway.

The block body is preserved in the log line (truncated) so a real occurrence can be
diagnosed without re-running generation.

---

## 4. The replacement map

Dead types are not simply deleted — each is reassigned to a built block that carries the
same cognitive work, with the pedagogy the existing prompt states for that family.

### LANGUAGE — the family with the most to lose

| Dead | Replacement | Rationale |
|---|---|---|
| `tap_pairs` | `## Match:` → `drag_drop` | Identical task: pair L2 with L1. Already built, with keyboard support as well as drag. A direct equivalent. |
| `word_bank` | `## Complete:` → `fill_blank` | Both test productive recall inside a fixed frame. Cloze constrains more than free assembly (see loss below). |
| `translate_sentence` | `## Complete:` → `fill_blank` | Keeps production of the target sentence; the blank carries the item being tested rather than the whole sentence. |
| `listen_and_type` | `audio` section + `## Pregunta:` → `check` | The `audio` block gives real TTS listening practice. Comprehension is then checked rather than transcribed. |
| `speak_sentence` | **not preserved — see §5** | |
| `flashcards` | `## Flashcards:` (unchanged) | Already renders; only the authoring surface moves from `:::` to `##`. |

A language lesson still gets: vocabulary pairing, cloze production, spaced-repetition
flashcards, real audio, conversational choice via `## Scenario:`, and comprehension
checks. It remains a language course.

### PROGRAMMING — the family that gains

| Dead | Replacement | Rationale |
|---|---|---|
| `code_challenge` | `## Playground:` → `code_playground` | The playground is a real sandboxed editor that runs code and compares `expected_output`. It is the strongest interactive block in the repo and the prompt barely used it. |
| `code_completion` | `## Playground:` (partial code) | Same block, seeded with a stub to finish. |
| `terminal_exercise` | `## Playground:` | Same block. |
| `bug_fix` | `## Playground:` (broken code + `expected_output`) | The playground already supports exactly this shape — seed broken code, state the expected output, let the student fix and run. |
| `output_prediction` | `## Pregunta:` → `check` | "What does this print?" is a multiple-choice comprehension item. `check` is graded client-side with immediate feedback, which `output_prediction` never was. |

### STEM

| Dead | Replacement | Rationale |
|---|---|---|
| `output_prediction` | `## Pregunta:` → `check` | As above. |
| `drag_order` | `## Match:` (concept↔formula) + `## Complete:` (stepwise) | Partial: see §5. |

Retains `## Simulation:`, which is the family's strongest block — the student manipulates
variables against a formula.

### DESIGN

| Dead | Replacement | Rationale |
|---|---|---|
| `image_label` | `## Visual:` + `## Pregunta:` | The reference image still renders (AI-generated); identification becomes a question about it rather than a click-on-region interaction. |
| `drag_order` | `## Match:` (principle↔example) | Matching is the more useful design task anyway. |

### BUSINESS

| Dead | Replacement | Rationale |
|---|---|---|
| `drag_order` | `## Match:` (step↔purpose) + `## Complete:` (framework slots) | Retains `## Scenario:`, which the prompt already makes this family's centre of gravity. |

---

## 5. What genuinely cannot be preserved

Stated plainly rather than papered over.

1. **Productive speaking (`speak_sentence`).** No lesson-section block captures speech.
   `voice_recorder_controller.js` exists but is wired to the assessments engine, not to
   lesson sections, and nothing scores pronunciation. The `audio` block gives *receptive*
   listening only. **A language route after WP-6 has no productive speaking practice.**
   This is the single real capability loss and it should go near the front of WP-10 —
   ElevenLabs Scribe is already contracted (`AUDIT.md` §9).
2. **Free-form sentence assembly (`word_bank`) and sequence ordering (`drag_order`).**
   `drag_drop` pairs items; it does not order them. Cloze and matching cover most of the
   ground, but "put these five steps in order" has no home. Minor, and a plausible small
   extension to the existing `drag_drop` controller later.
3. **Click-on-region image labelling (`image_label`).** Degrades to a question about a
   rendered image.

Everything else in the map is a genuine equivalent or an upgrade.

---

## 6. Explicitly out of scope

No server-side grading. `AUDIT.md` §P1-9 stands: none of these blocks reports results to
the server, so FSRS, XP and gap analysis stay starved. Every replacement above is
client-side-only, exactly like what it replaces — this package changes *what is
requested*, not *how it is graded*. That is WP-10, and it is the reason WP-10 must not be
deferred indefinitely: the contract being closed will make the lessons look finished.
