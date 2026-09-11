# WP-36 — Narrated scenes: design

Branch `wp36-narrated-scenes`, off `main` at `22beb68` (WP-33 merged).
Brief: `PROMPT_27_WP36_NARRATED_SCENES.md`, including its **Brainstorm answers (11 September)**
appendix, which supersedes the body where they differ. This spec is checked against that appendix;
every decision below either comes from it or is marked **[new]** and carries its evidence.

## 1. What this builds

A `motion` lesson block: a Motion Canvas scene drawn live in the browser, narrated by ElevenLabs,
with the animation following the voice. Two scenes ship (`agreement`, `transform`); the other five
patterns become one file each afterwards. Folded in: the two provider calls that spend money outside
`SpendGuard` (WP-34 §3.1, §3.2), because this package adds a third paid call and must not be the
reason the fence is still missing.

Out of scope, and named so no plan step drifts into them: the other five scenes, phase screens,
Task 8 paid-module generation, WP-20's recalculated free-tier number, any video file, the social
repositories.

## 2. Components

| Unit | Lives at | Does | Depends on |
|---|---|---|---|
| Scene sources | `app/motion/src/scenes/*.tsx` | the animation, one file per pattern | `@motion-canvas/{core,2d}`, `lib/cues` |
| Scene schemas | `app/motion/src/scenes/*.schema.json` | **the only copy** of a scene's data shape | nothing |
| Generated types | `app/motion/src/generated/schemas.d.ts` | TS types derived from the schemas | the schemas |
| Cue helper | `app/motion/src/lib/cues.ts` | pure `cueFor` / `waitUntilTime`, no MC imports | nothing |
| Runtime entry | `app/motion/src/main.ts` | `window.mc.mount(el, scene, {data, words})` | the above |
| Artifact | `vendor/javascript/mc.js` | one committed IIFE, `:self` under CSP | built by `bin/motion-build` |
| `MotionScenes` | `engines/content_engine/app/services/content_engine/motion_scenes.rb` | discovers schemas, validates `data` | `json_schemer` |
| Parser branch | `lesson_section_parser.rb` | `## Motion:` → a `motion` section or a `concept` | `MotionScenes` |
| Partial | `.../lesson_sections/_motion.html.erb` | mounts the controller | — |
| Controller | `app/javascript/controllers/motion_scene_controller.js` | lazy-loads `mc.js`, owns **sync only** | `mc.js`, the audio endpoints |
| Narration | `SectionAudioGenerator` (extended) | `timestamps:` option, words into `audio_sections` | `AiClient` |

## 3. Order of work

**Section numbers in this doc are its own (1–11); the brief's are written `brief §N`.**

Brief §5 first (the fence), then brief §1 runtime and hashes, then brief §2 the block through the
contract test, then brief §3 narration, then brief §4 sync, then one real generated lesson as
production-path evidence.

## 4. Brief §5 — the fence, first

`lesson_assistant_agent.rb:58` calls `RubyLLM.chat` directly; `voice_evaluator.rb` posts to
`api.elevenlabs.io/v1/speech-to-text` with its own `Net::HTTP`. Both bypass `SpendGuard.call`
(`ai_client.rb:27`) and the rate limit.

- `AiClient` gains `request_elevenlabs_stt(...)` beside `request_elevenlabs`, reached through
  `chat`/a sibling entry point so `SpendGuard.call` runs first. `SpeechCostRecorder.record_stt!`
  already exists and is used unchanged.
- `LessonAssistantAgent#build_chat` goes through `AiClient`.
- **The class test, red first:** a sweep over `app/**/*.rb` and `engines/*/app/**/*.rb` failing on
  `RubyLLM.chat`, `RubyLLM.paint`, `api.elevenlabs.io`, `api.openai.com` outside
  `ai_orchestrator/app/services/ai_orchestrator/ai_client.rb`. Red today on exactly two files; that
  count is asserted, so the sweep cannot pass by looking at nothing (the WP-33 enrichment-sweep
  lesson: a sweep that finds nothing is a broken sweep until proven otherwise).

## 5. Brief §1 — the runtime and the two hashes

`app/motion/` holds the source, cleaned of the demo's `probe.tsx`. `vite build` → one IIFE at
`vendor/javascript/mc.js`, pinned in `config/importmap.rb` and lazily imported the way
`mermaid_diagram_controller.js:13` imports Mermaid, so the ~186 KB never reaches a lesson with no
scene. CSP is unchanged: `vendor/javascript` is `:self`.

**Two derived artifacts, two headers, two Ruby tests, composing:**

- `vendor/javascript/mc.js` carries the SHA-256 of **every build input under `app/motion/`** except
  `dist/` and `node_modules/` — files only, sorted by relative path, hashed as `path + "\n" + content`
  so a rename or a move moves the hash. The lockfile is an input; it pins every dependency, which is
  strictly more than two version strings. The two Motion Canvas versions stay in the header as
  human-readable information, never as the check.
- `app/motion/src/generated/schemas.d.ts` carries the SHA-256 of `src/scenes/*.schema.json` only.
- `schemas.d.ts` is **inside** `mc.js`'s input set. It is a build input, and its own test proves it
  matches the schemas, so the two checks compose without circularity.
- Inputs are enumerated in Ruby with `Dir.glob` and an explicit exclude list, **never** by shelling
  to git: the test must run where git is not available.
- `bin/motion-build` is the only writer of either header, and the one documented command.

Rationale for hashing everything rather than a named list: anything less certifies what it has not
looked at, and a list is a thing someone must remember to extend.

**[new] Node is a developer dependency, not a runtime one.** The image still has no node. `bin/motion-build`
and the `cues.ts` node test both need it locally; the two hash tests do not. Measured here: node
v25.9.0, which strips TypeScript types natively, so `cues.ts` runs under node with no loader — the
same shape as `test/javascript/journey_layout_test.rb`. The spec records the floor as **node ≥ 23.6**
(type stripping on by default) and the test skips with an explicit message, never silently, when node
is absent or older.

## 6. Brief §2 — `motion` is a block like the others

Authoring shape, from the appendix — **nested, not the flat example in the body of the brief**:

```
## Motion: agreement
{ "narration": "Mira o sujeito. «Ele» é terceira pessoa, então o verbo leva -s.",
  "data": { "tokens": ["He","have","coffee","."], "subject": 0, "verb": 1,
            "wrong": "have", "correct": "has", "why": "«He» é terceira pessoa: has, não have." } }
```

Ruby owns `narration`; the scene's schema owns `data`. The heading's title is the scene name.

`ContentEngine::MotionScenes` discovers `app/motion/src/scenes/*.schema.json` at boot — **the file set
IS the vocabulary**, there is no second list — and validates `data` with `json_schemer` (2.5.0,
already in `Gemfile.lock` via `mcp`; declared explicitly in the `Gemfile`, no new install). Schemas
are draft 2020-12 with `additionalProperties: false` and `examples: [<the fallback>]`. One vendor
keyword, `x-index-into: "tokens"`, covers index-into-array rules that JSON Schema cannot express; a
small Ruby post-pass honours it and every other consumer ignores it.

The parser emits `{type: "motion", scene:, data:, narration:, body:}`. **Invalid `data`, malformed
JSON, or an unknown scene → a `concept` whose body is the narration text**, with a log line saying
why, exactly as a dropped `:::` block logs. *A default may render less; it may never render something
false.*

Five parts, in the order `LessonBlocks`' own comment gives, with `lesson_block_contract_test.rb`
failing until all five exist: parser branch, partial, Stimulus controller, `BLOCKS` entry, prompt
section.

`lesson_content.yml` gains a `## Motion:` section teaching the syntax, the two scene names, their
JSON shapes and the narration rule (one to three sentences, in the route's locale, naming the thing
the scene shows). **Module 1 carries one or at most two motion blocks, other modules none until
Task 8** — learned from `curriculum_design.yml` or a pipeline option, whichever the contract test can
pin, and never hardcoded in the parser.

**Language-neutral by contract.** No schema constrains a string to Latin script or English. The
prompt's example uses a non-English target (the live route is Portuguese for Spanish speakers). The
system test's fixture renders one non-Latin token with no missing-glyph box.

**[new] The font decision I was asked to make and state: CJK, not Arabic.** Arabic needs contextual
shaping and RTL, and Motion Canvas lays tokens out in an LTR flex `Layout` — a bidi bug would be
indistinguishable from a font bug and would make the test lie. The scene font stack becomes
`'DM Sans', 'Hiragino Sans GB', 'PingFang SC', 'Noto Sans CJK SC', system-ui, sans-serif`; Hiragino
Sans GB is present on this machine and is what supplies the glyph. The assertion is a measurement,
not a screenshot: in-canvas `measureText(token).width` must differ from that of U+FFFF (a permanently
unassigned noncharacter)
under the same font stack, because a missing glyph renders at the notdef width. If the CI image
lacks a CJK face the test fails loudly with the font stack in the message rather than passing on tofu.

## 7. Brief §3 — narration with word times, through the one client

`AiClient#request_elevenlabs` gains `timestamps: true`, switching to
`/v1/text-to-speech/{voice_id}/with-timestamps`, decoding `audio_base64`, and returning `alignment`
beside `content`. `SpendGuard.call` at `:27` already runs before either endpoint and is untouched.

Words are derived from the character alignment: a word is a run of non-space characters, its start is
its first character's start, its end its last character's end.

**Cost.** `request_elevenlabs` already reads `billed_characters` from the `character-cost` response
header and tolerates its absence. **[new]** Unresolvable without a paid call: whether that header
exists on the `with-timestamps` endpoint is a fact about the provider, not about this codebase. The
plan therefore carries it as a step-6 observation: the single generated lesson prints the header's
presence and the recorded cost, and if it is absent the fallback bills `text.length` and the handoff
says so — because the ledger must never show $0.00 for a paid call, which is existing roadmap debt
(`openai_chat`) and must not gain a second instance here.

**Storage — one narration path, not two.** `SectionAudioGenerator` gains a `timestamps:` option; the
word array is stored at `audio_sections[index]["words"]`. That is a **top-level** metadata key, never
inside `parsed_sections`; `SectionEnrichment::KEYS` is the list of exceptions to the parser's
ownership of that array and does not grow for this. The existing `with_lock` + `merge_metadata!`
discipline at `update_step_audio_status!` is reused unchanged.

`SectionAudioController#generate` / `#status` serve motion blocks too, with `words` in the status
payload when present.

**Prefetch — the gates stay shut.** Evidence gathered during this brainstorm: `MediaPrefetchJob:24`
and `ContentPipelineJob:24` both `return unless @step.preview_access?`, so purchased modules generate
nothing at all until Task 8; and today's audio branch has no preview/paid test, so audio prefetches
for preview steps and for nobody else — the inverse of both WP-20 §C and §3's wording. WP-36 lifts
neither gate. Instead `narration_prefetch_types(access_state)` returns `concept summary motion` for
`:purchased` and `concept summary` for `:preview`, so motion is on demand in preview. The purchased
branch is **dormant by design**, carries its own unit test, and is pinned with a comment naming
Task 8. A purchased step still enqueues nothing.

*(Observed while reading, not in scope and not fixed: `MediaPrefetchJob:23` assigns `@options` and
nothing reads it.)*

## 8. Brief §4 — the voice leads, the picture follows

**The scene computes its own cues; Ruby never does; the controller passes `words`.** Only the scene
knows which token a beat names — `transform`'s per-step `tokens` are the proof, and a schema-declared
"which field is spoken" would be one more copy of scene knowledge in the file that is supposed to
describe the model's data.

`app/motion/src/lib/cues.ts` is pure, imports nothing from Motion Canvas, and exposes:

- `cueFor(text, words, from)` — normalised match (case, punctuation), searching **forward from the
  previous cue** so a repeated word resolves in order; `null` on a miss.
- `waitUntilTime(t)` — waits on the scene clock.

A scene calls `cueFor` for each beat that names a word and falls back to that beat's fixed duration
on `null` or when `words` is absent. Beats that name nothing keep their durations. The helper counts
misses; the scene reports `cueStats`; the controller logs the fallback rate the handoff asks for.

`mc.mount(el, scene, {data, words})`. The controller owns **sync only**: on `timeupdate` it compares
`audio.currentTime` with the player's time and seeks when drift exceeds 120 ms (using whichever of
`player.requestSeek` / `playback.seek(frame)` the demo's Player version exposes — to be confirmed
against the pinned 3.17.2 during the runtime work, not guessed here); pause pauses both; ended shows the final
frame; replay resets both.

**Reduced motion**, the way `route_journey_controller.js:64` does it: the scene renders its final
frame from the start and the narration still plays.

**Failure is visible and local** (WP-35's rule): TTS refused by the guard → the block shows the
narration text and the scene plays on its fixed timings, with the localized sentence already in both locales —
**[new]** `learning_engine.spend_guard.{daily_budget,user_budget,rate_limit}`, verified present in
`en.yml:1692` and `es.yml`; the brief's `refuse_agent` partial does not exist under that name; `mc.js` fails to load → the narration text and a play button for audio alone. Never a
blank block, never an English literal.

## 9. Tests — the classes they prevent

1. **A declared block type is missing one of its five parts** — the existing contract test. Plus:
   invalid `## Motion:` JSON renders as a concept with the narration; an unknown scene does the same.
2. **A provider is called outside the guard** — the provider sweep of §4 *The fence, first* above,
   red first on exactly two files.
3. **The picture does not follow the voice** — node unit tests on `cueFor` (exact match,
   normalisation, forward search with a repeated word, the miss, the no-words case); and a system
   test whose narration is a **committed fixture** (`test/fixtures/files/`, words + mp3, **no paid
   call in the suite**): press play, the canvas has a box, the audio element is playing, and the
   token the fixture says is spoken at 1.2 s is highlighted after 1.2 s and not before.
4. **The artifact drifted from its source** — the two hash tests of §5 *The runtime and the two
   hashes* above.
5. **Preview prefetches narration** — `narration_prefetch_types(:preview)` excludes `motion`;
   `(:purchased)` includes it; a preview step with a motion block enqueues no audio task.
6. **The narration write erases a sibling** — `audio_sections[index]["words"]` written while another
   index is written concurrently, both survive, in `step_metadata_write_isolation_test.rb`.
7. **[new] The four schema consumers drift** — every schema has a scene and every scene a schema;
   every `examples[0]` validates against its own schema; the `## Motion:` example in
   `lesson_content.yml` validates against the schema its heading names.

**TDD discipline, from the brief:** the test is observed red before the code that makes it green, and
for a test added next to a fix, break the fix and watch *that* test go red. WP-33 round two shipped a
guard test whose fixture contained an earlier sufficient cause, so it passed without ever reaching the
mechanism it named; every guard test here is proven reachable that way.

## 10. Risks

| Risk | Handling |
|---|---|
| `character-cost` absent on the timestamps endpoint | Observed in step 6 with the one paid call; fallback bills `text.length`; handoff states which happened |
| `player.requestSeek` vs `playback.seek` in 3.17.2 | Confirmed against the pinned version during the runtime work, before sync depends on it |
| CI image lacks a CJK face | The measurement test fails loudly with the font stack in the message; it cannot pass on tofu |
| node absent or < 23.6 | `cues.ts` node test skips with an explicit message, never silently |
| 186 KB on every lesson | Lazy import, asserted: a lesson with no motion block must not request `mc.js` |

## 11. Production-path evidence

Nothing is ✅ because a piece works in isolation. One real lesson generated in development with the
prompt change — **one paid call, its cost stated** — and rendered end to end. Plus, in a browser: word
lighting on the voice, drift under 120 ms across a 20 s narration (logged), reduced motion showing the
final frame, and both failure states reading as a sentence in the student's language.

Verification before the handoff: the three suites, three runs each, from a clean base, as
`WP33_HANDOFF.md` tabulates them (the four known engine failures and nothing else); RuboCop clean.
Then a subagent review of the diff against the brief, its findings in the handoff, fixed or argued.
