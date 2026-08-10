# PROMPT 03 — WP-5: make every route a real curriculum

> Run from `~/Documents/Learning-routes`. `AUDIT.md` §P1-1, §P1-3, §P1-4 and §7 are the reference.
> Production now runs HEAD (deployed 2026-08-06). WP-1 and WP-2 are live.

---

## Goal

Today **100% of routes are the same hardcoded 8-step template**, whatever the topic. One missing
constant is why. Fix that, then add the correctness layer that keeps it working.

Success is not "the constant is added". Success is: **two routes on different subjects produce
visibly different curricula, proven by a real generation, not a mock.**

## The trap — read this before planning

`AiModelConfig::TASK_TYPES` omits `curriculum_design`, so `AiInteraction.create!` raises
`RecordInvalid`, `CurriculumBrain` rescues it (`curriculum_brain.rb:60-62`, logs at `error`) and
returns `nil`, and `wizard_route_generation_job.rb:46` falls back to the template.

Adding the constant makes `CurriculumBrain` actually reach the model — and
`ModelRouter::ROUTING_TABLE:8` routes `curriculum_design` to **`gpt-4.1-mini`**, which per `AUDIT.md`
§P1-7 **is no longer in OpenAI's catalogue**. The call would fail, the same rescue would swallow it,
and you would fall back to the template again — with the fix "applied" and nothing visibly changed.

**So P1-1 is not a one-line change.** It requires a valid model ID on the `curriculum_design` path.
Do not skip this or you will report success on a fix that does nothing.

## Hard constraints

1. **Do not deploy.** Leave that to a human.
2. **Prove it against the real API at least once.** Unit tests with stubbed clients cannot catch a
   dead model ID — that is the exact failure this package is about. Two real curriculum generations
   cost cents.
3. Scope: P1-1, P1-3, P1-4, plus the minimum of P1-7 needed for the `curriculum_design` path to
   work. Anything else goes in `FINDINGS_WP5.md`.
4. **Do not "fix" the 14 red engine tests** catalogued in `FINDINGS_WP2.md §1`. They belong to WP-4.
   But do not make them worse — report the count before and after.
5. Work in phases: read → research → change → prove. Do not edit in phase 1.

---

## PHASE 1 — Read

- `engines/ai_orchestrator/app/models/ai_orchestrator/ai_model_config.rb` (TASK_TYPES, :17-38)
- `engines/ai_orchestrator/app/models/ai_orchestrator/ai_interaction.rb:38` (the validation)
- `engines/ai_orchestrator/app/services/ai_orchestrator/model_router.rb` (ROUTING_TABLE, cost caps)
- `engines/ai_orchestrator/app/services/ai_orchestrator/orchestrate.rb:49`
- `engines/ai_orchestrator/app/services/ai_orchestrator/curriculum_brain.rb` **in full** — especially
  the validation at `:124-192`, which `AUDIT.md` §7 calls out as genuinely good. It is ready to work
  the moment this unlocks. Do not rewrite it.
- `engines/ai_orchestrator/app/services/ai_orchestrator/ai_client.rb:35-45` (`.except(:response_format)`)
- `engines/ai_orchestrator/app/services/ai_orchestrator/response_parser.rb:80-95`
- `app/jobs/wizard_route_generation_job.rb` (the fallback path, ~:46)
- `config/prompts/curriculum_design.yml` (242 lines) and `lesson_content.yml`
- `engines/ai_orchestrator/app/services/ai_orchestrator/cost_tracker.rb`

Confirm each defect still exists before fixing it.

## PHASE 2 — Research

1. **Current OpenAI model IDs and prices (August 2026).** Web-search this; do not trust the
   hardcoded values or my summary. You need the exact API identifiers for the current tiers, and
   which is the right cost/latency fit for structured JSON curriculum design. Cite sources.
2. **`ruby_llm` 1.11.0 `with_schema`** — read the installed gem, not just the docs: signature at
   `lib/ruby_llm/chat.rb:95`, how it interacts with `with_params` / `with_temperature`, what it
   returns, and how it fails when the model returns non-conforming JSON. `ruby_llm-schema` 0.2.5 is
   installed and has **zero call sites** in this repo — you are the first user.
3. How `ruby_llm` surfaces an unknown/retired model ID — the error class matters for point 3 in §A.

---

## PHASE 3 — Changes

### §A · P1-1 — unlock CurriculumBrain

1. Add `curriculum_design` and `content_agent` to `TASK_TYPES`.
2. **Update the model IDs on the `curriculum_design` path** to something that exists today, per your
   Phase 2 research. Update `cost_tracker.rb` prices for whatever you route to — otherwise cost caps
   are computed from February's numbers.
   *Full model-ID cleanup across every task type is WP-7. Here, do only what `curriculum_design`
   needs to work, and note the rest.*
3. **Stop the rescue from hiding this class of failure.** `curriculum_brain.rb:60-62` logs at
   `error` and returns `nil` — which is defensible as fail-open, but it is why a total product
   failure stayed invisible for months. At minimum: distinguish "the model refused / returned bad
   structure" (expected, fall back quietly) from "we could not call the model at all" (a
   misconfiguration — log loudly, and surface it somewhere a human sees). Propose the mechanism;
   do not silently swallow configuration errors.
4. Add a test asserting `ModelRouter::ROUTING_TABLE.keys.map(&:to_s) - AiModelConfig::TASK_TYPES == []`
   so the two lists can never drift apart again. This test is the point of the package.

### §B · P1-3 — real structured output

`ai_client.rb:39` does `.except(:response_format)`, so the 12 prompt templates declaring
`response_format: json` are silently ignored — the model is merely *asked* in prose to return JSON.

Replace prose-instructed JSON with `chat.with_schema(...)` for the task types that declare it,
starting with `curriculum_design`. Define the schema from the contract already written in
`curriculum_design.yml` — do not invent a new shape.

Keep a working path for task types that legitimately return prose. Say clearly which types you
converted and which you left alone, and why.

### §C · P1-4 — retire the extractor from the hot path

With `with_schema` returning a parsed Hash, `ResponseParser`'s regex extraction is no longer on the
`curriculum_design` path. Confirm that and note which paths still depend on it.

Its real defects (`AUDIT.md` §P1-4) are reproduced and specific: greedy match over-runs when JSON is
followed by prose containing `}`; the fence regex at `:85` is lazy and fires on inner fences. **The
damaging case is a lesson body containing a fenced code block — which is most of them.** If any path
still uses the extractor, fix the fence check to "is the *whole* response fenced" and brace-balance
instead of greedy-matching. If no path uses it, say so and leave it.

### §D · Tests

- The `ROUTING_TABLE ⊆ TASK_TYPES` assertion from §A4.
- `AiInteraction.create!(task_type: "curriculum_design")` succeeds.
- `CurriculumBrain` returns a validated structure (not `nil`) for a stubbed valid model response.
- A schema-conformance test for the `with_schema` payload.
- A regression test that a **configuration** error is not silently swallowed as a content error.

Run both suites and report both numbers, before and after:

```bash
bin/rails db:test:prepare test          # the CI path — was 101 runs, 0F 0E
bin/rails test test engines/*/test      # everything — was 389 runs, 5F 9E
```

---

## PHASE 4 — Prove it

Mocks cannot prove this works. Generate two real curricula on deliberately different subjects — one
language, one technical, e.g. **"Portuguese for Spanish speakers, beginner"** and **"Recursion in
Python, intermediate"** — through the real `CurriculumBrain` path with a real API key.

Then show, side by side:

- the step titles of both routes
- the step count of each
- that neither matches the 8-step fallback template
- the `AiInteraction` rows created, with `task_type: "curriculum_design"`, their status and cost

If both come back as the same 8 generic steps, **the fix did not work** — say so plainly rather than
reporting the code change as done.

Write `WP5_HANDOFF.md` with: every change and why, both test counts, the two real curricula, the
model IDs and prices you set and your source for them, what you deliberately left for WP-7, and
anything that surprised you.

## Reporting back

Print only: the changes one line each, both test counts, the two curricula side by side, and the
cost of the real generations. I will read the handoff myself.
