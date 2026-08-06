# WP-5 handoff — every route is now a real curriculum

**Branch:** `wp5-real-curricula` · **Base:** `69aa924` · **Commits:** `54aa54e`, `94302dc`
**Nothing was deployed.** Deferred work: `FINDINGS_WP5.md`.

**Result:** proven against the live API. 6/6 generations across six unrelated subjects
produced distinct, correctly-classified curricula. Total real-API spend for all
verification: **23¢ across 24 calls**.

---

## 1. Changes

### §A — P1-1, unlock CurriculumBrain

| File:line | Change | Why |
|---|---|---|
| `ai_model_config.rb:26-33` | Register `curriculum_design` and `content_agent` in `TASK_TYPES` | The whole outage. Both were already in `ROUTING_TABLE`; only this list disagreed, so `AiInteraction.create!` raised `RecordInvalid` and every route fell back. |
| `cache_service.rb:22-31` | TTLs for both (`curriculum_design` 12h, `content_agent` 0) | A pre-existing invariant test requires a TTL per task type. 12h = half of `route_generation`'s 24h, to limit blast radius while this beds in. |
| `orchestrate.rb:3-11, 55-73` | New `ConfigurationError`; `AiInteraction.create!` failures translate into it | "The app is misconfigured" must not look like "the model answered badly". Collapsing the two is exactly what hid this for months. |
| `curriculum_brain.rb:74-88` | Rescue `ConfigurationError` separately | Logs `[MISCONFIGURATION]`, reports to `Rails.error`, **raises in dev/test**, still fails open in production. |
| `test/models/.../ai_model_config_test.rb` | 7 invariant tests | The point of the package — see §4. |

**No model ID was changed, and none needed to be.** See §5: the premise that
`gpt-4.1-mini` is retired is false.

### §B — P1-3, real structured output

| File | Change |
|---|---|
| `schemas/curriculum_design_schema.rb` (new) | JSON Schema transcribed from the contract already in `curriculum_design.yml:184-231`. Not a new contract. |
| `schema_registry.rb` (new) | task_type → schema. Only `curriculum_design` registered. |
| `ai_client.rb:41-46` | `chat.with_schema(schema)` when the task has one |
| `ai_client.rb:63-70, 176-181` | Re-serialize schema responses — RubyLLM returns a parsed Hash, but `AiInteraction#response` is a `text` column every consumer `JSON.parse`s |

**Division of labour, deliberate:** the schema enforces *shape* (keys, types, closed
enums); `CurriculumBrain#validate!` keeps enforcing *semantics* (bloom 1-6, minutes
5-90, 3..24 steps, prerequisite ordering). That split is not stylistic — OpenAI strict
mode rejects `minimum`/`maximum`/`minItems`/`maxItems`, so the bounds cannot live in
the schema even if we wanted them to. **The existing validation was not rewritten.**

**Converted:** `curriculum_design` only.
**Left alone:** `lesson_content`, `tutor_reply`, `explain_differently`, `give_example`,
`simplify_content` — these return narrative markdown with embedded code fences, which a
strict object schema would fight. The other closed-shape types (`step_quiz`,
`assessment_questions`, `exam_questions`, `gap_analysis`) are good candidates but were
left for a follow-up so each lands with its own conformance test.

### §C — P1-4, the extractor

**`CurriculumBrain` never used `ResponseParser`** — it has its own `parse_response`. So
`with_schema` did not retire it from this path; it was never on it. But **seven other
call sites still use it**, so the fix was still required:

`response_parser.rb:81-142` — only unwrap a fence when the *whole* response is fenced
(`\A...\z`), and brace-balance (skipping string contents and escapes) instead of greedy
matching. Five regression tests added, each reproduced as a real failure first:

| Case | Before | After |
|---|---|---|
| JSON + trailing prose containing `}` | FAILED | PARSED |
| Raw JSON with a ``` fence inside a string value | FAILED | PARSED |
| Fenced JSON whose body contains its own fence | FAILED | PARSED |
| Braces inside string values | (untested) | PARSED |
| Prose before JSON | PARSED | PARSED |

The second and third are the damaging ones — a lesson body containing a code block,
which is most of them.

### Reliability fixes (commit `94302dc`) — found only by running the real thing

| File:line | Change | Evidence |
|---|---|---|
| `ai_services.rb:28-34`, `ai_client.rb:158-172` | Per-task `request_timeout`, applied via `RubyLLM.context`; `curriculum_design` → 120s | The global 30s timeout sat **inside** the latency distribution: measured 21.6s–32.7s, median 26.7s. ~1 call in 7 timed out on the primary, then burned another 30s timing out the fallback. Scoped so short interactive calls keep 30s. |
| `curriculum_brain.rb:57, 128-160` | `repair!` drops out-of-range prerequisites before validation | The dominant remaining failure: `step 9 has bad prerequisite 9`. A schema cannot express "integers < this element's index". Dropping an edge can only ever loosen the graph, never invent an edge, so it stays acyclic. |

### Out of stated scope, fixed by necessity

`prompt_builder.rb:96-101` — the profile was read via a lazy `has_one`, which raised for
**every** `Orchestrate` call carrying a user, including this one. Same one-line fix as
WP-2's. Without it the curriculum_design path cannot run under the test guard.

---

## 2. Test counts

| Path | WP-2 end | WP-5 end |
|---|---|---|
| `bin/rails db:test:prepare test` (CI) | 101 runs, 0F 0E | **126 runs, 349 assertions, 0F 0E** |
| `bin/rails test test engines/*/test` (all) | 389 runs, **5F 9E** | 419 runs, 1173 assertions, **5F 9E** |

**The 14 engine failures are unchanged — not made worse, and not touched.** They are
`FINDINGS_WP2.md §1` and belong to WP-4. Verified by name, not just by count.

`bin/rubocop`: 89 files, no offenses.

> **One mistake worth knowing about**, because a pre-existing test caught it and my new
> ones did not: I first wrote the `TASK_TYPES` comment *inside* the `%w[...]` literal.
> `%w[]` has no comment syntax, so all ~60 words of the comment became task types. Every
> invariant test still passed, because they all assert *subset* relations and junk
> entries only make the superset bigger. `AiOrchestrator::CacheServiceTest` failed and
> exposed it. There is now a `TASK_TYPES` well-formedness test that would have caught it.

---

## 3. The proof — two real curricula, one API key, no mocks

Same fallback template both would have received before this change:

```
FALLBACK TEMPLATE — 8 steps (what EVERY route was, on every subject)
  1. Core Fundamentals      5. Review & Consolidation
  2. Essential Concepts     6. Early Intermediate
  3. Initial Practice       7. Practical Application
  4. First Projects         8. Final Assessment
```

| | **Portuguese for Spanish speakers** (beginner, es) | **Recursion in Python** (intermediate, en) |
|---|---|---|
| title | Portugués para hispanohablantes | Mastering Recursion in Python |
| subject_area | Language · Portuguese | Programming · Python |
| subject_family | `language` | `programming` |
| steps | 8 | 8 |
| latency | 29.4s | 20.4s |
| 1 | Vocabulario básico y pronunciación inicial `tap_pairs, listen_and_type, flashcards` | Setting up Python for Recursion `terminal_exercise, code_completion` |
| 2 | Reconocimiento auditivo y lectura de palabras `listen_and_type, tap_pairs` | Reading and Understanding Recursive Code `output_prediction, bug_fix` |
| 3 | Traducción básica de oraciones simples `word_bank, fill_blank, translate_sentence` | Writing Recursive Functions for Classic Problems `code_completion, code_challenge` |
| 4 | Producción de oraciones básicas `translate_sentence, speak_sentence` | Review: Key Concepts in Recursion `fill_blank, flashcards` |
| 5 | Revisión de vocabulario y estructuras básicas `flashcards, fill_blank` | Advanced Recursive Patterns: Tail Recursion and Memo… `bug_fix, output_prediction` |
| 6 | Conversación básica en portugués `speak_sentence, translate_sentence` | Applying Recursion to Data Structures `code_challenge, bug_fix` |
| 7 | Revisión general y práctica integrada `flashcards, fill_blank, speak_sentence` | Review: Recursive Algorithms and Optimization `fill_blank, flashcards, bug_fix` |
| 8 | Evaluación práctica: comunicación básica `translate_sentence, speak_sentence` | Capstone Project: Building a Recursive Solution `code_challenge, terminal_exercise` |

```
A == B?                 false
A overlaps fallback?    false   []
B overlaps fallback?    false   []
distinct family?        language vs programming
```

Neither shares a single step title with the template or with each other. Exercise types
are subject-appropriate — speech and vocabulary for the language route, terminal and
debugging for the programming route — and the Spanish route is written in Spanish.

### Reliability across six more subjects, after both fixes

```
OK  Japanese for absolute beginners       8 steps  language     Japonés para principiantes absolutos
OK  Rust ownership and borrowing          9 steps  programming  Mastering Rust Ownership and Borrowing
OK  Jazz piano improvisation             10 steps  other        Improvisación en piano jazz
OK  Linear algebra for machine learning   8 steps  stem         Linear Algebra for Machine Learning
OK  Typography fundamentals               9 steps  design       Fundamentos de la Tipografía
OK  Unit economics for SaaS founders      9 steps  business     Unit Economics for SaaS Founders
--- 6/6 produced a real curriculum ---
```

### AiInteraction rows

```
task_type=curriculum_design   24 calls   23¢ total   (~$0.23)
completed  gpt-4.1-mini  in=3139  out=2085  cost=1¢  26698ms
completed  gpt-4.1-mini  in=3143  out=1840  cost=1¢  21606ms
failed     gpt-4.1-mini  in=0     out=0     cost=0¢      0ms  err=Both primary (gpt-4.1-mini)
                                                              and fallback (gpt-5.2) failed:
                                                              Request to gpt-5.2 timed out
completed  gpt-4.1-mini  in=3139  out=2087  cost=1¢  32687ms   <- would have timed out before
...
```

**~1¢ per curriculum.** The one `failed` row is the pre-fix timeout, kept here as the
evidence that motivated the `request_timeout` change; the 32.7s row after it is a call
that would have failed under the old 30s ceiling.

---

## 4. Why the invariant tests are the real deliverable

The outage was not a logic bug. Two lists disagreed, and a rescue in between converted
the consequence into a silent fallback. Nothing failed, no error rate moved, no job
died — every route was simply generic. Behaviour tests cannot see that. So:

| Test | Guards |
|---|---|
| `ROUTING_TABLE.keys ⊆ TASK_TYPES` | the exact drift that caused this |
| routable models ⊆ `SUPPORTED_MODELS` | the same failure one field over — `AiInteraction` validates `model` too, which PROMPT 03 did not mention |
| every routable model ∈ `PRICING` | otherwise `estimate_cost` silently returns 0 and every cap treats the calls as free |
| an `AiInteraction` is creatable for every routed task type | the end-to-end assertion; this is literally what `Orchestrate.call` does |
| `TASK_TYPES` are well-formed identifiers | catches the `%w[]`-comment mistake described in §2 |

---

## 5. What surprised me

1. **The premise of the prompt was wrong.** `gpt-4.1-mini` is *not* retired — it
   resolves, serves traffic, and supports strict structured outputs. I verified against
   `/v1/models` and a live chat completion rather than trusting the audit or a pricing
   blog. The audit's §P1-7 claim came from marketing pages listing only headline tiers.
   **So P1-1 really was a one-line fix**, and I changed no model IDs. Details and the
   WP-7 correction are in `FINDINGS_WP5.md §1`. Its pricing is also already correct.
2. **A second registry, unmentioned.** `AiInteraction::SUPPORTED_MODELS` validates the
   *model* the same way `TASK_TYPES` validates the task type. Any model change would
   have hit an identical `RecordInvalid` and an identical silent fallback. There is now
   a test for it.
3. **The real blockers were only visible against the live API**, exactly as the prompt
   predicted — but they were not the predicted ones. A 30s timeout sitting inside a
   21–33s latency distribution, and a model that intermittently makes a step its own
   prerequisite. Both invisible to any mock, and neither would have been found by adding
   the constant and running the unit tests.
4. **My own tests hid a bug.** All seven invariant tests passed while `TASK_TYPES`
   contained ~60 garbage entries, because subset assertions cannot see junk. A
   pre-existing test caught it. Assert the shape of a thing, not just its relations.
5. **A test-class name collision.** `engines/ai_orchestrator/test/.../curriculum_brain_test.rb`
   already defines `AiOrchestrator::CurriculumBrainTest`; my new file reopened the same
   class and the two `setup` methods clobbered each other — invisible when running one
   file, fatal for the full suite. Mine is now `CurriculumBrainWiringTest`.

---

## 6. For the human before deploy

- Nothing here needs a migration or a config change on the host.
- `curriculum_design` now makes a **real API call per route**, ~1¢ and ~20-35s, inside
  `WizardRouteGenerationJob`. Previously it cost nothing because it never ran. At 100
  routes/day that is roughly **$1/day**.
- Watch `[WizardRouteGeneration] Curriculum source=brain|template` — already logged at
  `wizard_route_generation_job.rb:48`. `source=template` now means a genuine failure
  worth investigating, not the everyday case.
- Watch for `[CurriculumBrain][MISCONFIGURATION]` — that means a registry drifted again
  and every route is silently generic. It is the alert this package exists to create.
- `[CurriculumBrain] Repaired N out-of-range prerequisite(s)` at info level is expected
  occasionally and is benign.
