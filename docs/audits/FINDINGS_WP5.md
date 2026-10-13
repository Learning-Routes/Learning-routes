# Findings deferred out of WP-5

Found while doing WP-5, deliberately **not** fixed here to keep the PR reviewable.

---

## 1. `AUDIT.md` §P1-7 is wrong about model retirement — correct it before WP-7

The audit (and PROMPT 03's "trap") state that `gpt-4.1-mini` is no longer in OpenAI's
catalogue and that routing `curriculum_design` to it would fail. **That is false.**
Verified against the live API rather than a pricing blog:

```
GET /v1/models/gpt-4.1-mini  -> {"id":"gpt-4.1-mini","object":"model","created":1744318173}
GET /v1/models/gpt-5.2       -> {"id":"gpt-5.2","object":"model","created":1765313051}
chat completion              -> OK, served by gpt-4.1-mini-2025-04-14
strict json_schema request   -> OK, {"label":"Intro"}
```

Both hardcoded models resolve, serve traffic and support strict structured outputs.
The audit's claim came from marketing pricing pages that list only the current
headline tiers; `/v1/models` is the authority and lists 130 models including the
whole `gpt-4.1` family. **No model change was needed for this package.**

Pricing in `cost_tracker.rb` for the model actually used is also correct:
`gpt-4.1-mini` is 40/160 cents per 1M in/out, matching the current published
$0.40/$1.60. Nothing to update for this path.

**For WP-7:** the catalogue has moved a long way past what is hardcoded — `gpt-5.4`,
`gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.5`, `gpt-5.6-luna/sol/terra`, `gpt-image-2`,
`gpt-image-1.5`. Re-check `gpt-5.2` pricing (`175/1400` cents) and the three
`claude-*` entries, which are priced but routed nowhere. Do the survey against
`/v1/models` plus the official pricing page, not third-party summaries.

## 2. Curriculum generation is slow enough to need a progress signal

Measured latency 20.4s–32.7s per curriculum, before any lesson content is generated.
The wizard's generating state already polls, so nothing is broken — but the route
now takes ~30s longer to appear than it did when every route was a template built in
memory. Worth confirming the polling UI reads well at that duration.

## 3. `subject_family` for music came back as `other`

"Jazz piano improvisation" classified as `other` rather than something musical. The
controlled vocabulary is `language | programming | design | stem | business | other`,
so `other` is technically correct — there is no music family. Downstream, the family
drives exercise-type selection, so music routes get generic treatment. Worth a
vocabulary review when the block types are rebuilt (WP-6/WP-10).

## 4. Only `curriculum_design` was converted to structured output

Eleven other prompt templates still declare `response_format: json` and still get
prose-instructed JSON. `SchemaRegistry` is built to take them one at a time, each
with a conformance test. The obvious next candidates are `step_quiz`,
`assessment_questions`, `exam_questions` and `gap_analysis` — all closed-shape.

Deliberately **not** candidates: `lesson_content`, `tutor_reply`,
`explain_differently`, `give_example`, `simplify_content`. Those return narrative
markdown with embedded code fences; a strict object schema would fight the format.

## 5. `ResponseParser` is still on seven paths

Its extraction bugs are fixed, but the seven call sites (`exercises_controller`,
`answers_controller`, `step_quiz_generation_job`, `assessment_generation_job`,
`gap_analyzer`, `reinforcement_generator`, `route_generator`) still parse
prose-instructed JSON. Each one converted to `with_schema` removes a class of
failure rather than patching it. `route_generator` is dead code (`AUDIT.md` §P3-2)
and should be deleted rather than converted.

## 6. Still open from AUDIT.md, untouched by this PR

| Ref | Item |
|---|---|
| P1-2 | Prompts order 11 block types the parser/renderer cannot render |
| P1-5 | 14 of 17 prompt templates receive no `{{language_directive}}` |
| P1-6 | ElevenLabs priced `flat: 0` — the largest per-route cost is invisible |
| P1-8 | `content_error` is written but never read; failures re-bill on refresh |
| P1-9 | No interactive exercise is graded server-side |
| P2-3..P2-6 | Password reset `forget!`, `/cable` auth, tutor XSS, XP replay |
| P3-1 | CI runs 126 of 419 tests and auto-deploys on green |
| — | The 14 engine strict-loading failures from `FINDINGS_WP2.md §1` (WP-4) |
