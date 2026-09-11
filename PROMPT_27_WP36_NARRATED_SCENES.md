# WP-36 — Narrated scenes: Motion Canvas + ElevenLabs, and no spend outside the guard

Branch: `wp36-narrated-scenes`, off `main` at `22beb68` (WP-33 merged) or later.

This is the first product package after nine bug packages, and the owner has moved it ahead of
WP-34 on purpose. It is still built under the same rules: every claim in the handoff is something
you ran; every behaviour ships with the test that prevents its class; a step is done when the
**production path calls it**, not when the piece works in isolation; and nothing that spends money
does so outside `SpendGuard` — which is why the two unguarded provider calls from the audit
(WP-34 §3.1, §3.2) are inside this package, not after it. English throughout.

## How to work this one — the superpowers skills, in this order

This repo already keeps its design work under `docs/superpowers/specs/` and `docs/superpowers/plans/`
(six plans, two specs). Use the skills, not just their names:

1. **`brainstorming`** first. The decisions below are settled; the brainstorm is for what they leave
   open (the scene JSON schema, how the scene consumes word times, how the build artifact is kept
   honest). Write the spec to `docs/superpowers/specs/2026-09-xx-wp36-narrated-scenes-design.md`
   and stop for the owner's yes before any code.
2. **`writing-plans`** → `docs/superpowers/plans/2026-09-xx-wp36-narrated-scenes.md`, small steps,
   each with its red test named.
3. **`executing-plans`** with **`test-driven-development`**: the test is observed red before the code
   that makes it green — and for a test added next to a fix, break the fix and watch *that* test go
   red. WP-33 round two shipped a guard test that never touched the mechanism it named; that is the
   failure mode this rule exists for.
4. **`systematic-debugging`** on any red you did not predict. No "flaky", no retry-until-green.
5. **`verification-before-completion`** before the handoff: the three suites, three runs each,
   from a clean base — and the production-path evidence for every ✅.
6. **`requesting-code-review`** — a subagent review of the diff against this brief before you call
   it done; its findings go in the handoff, fixed or argued.

If a named skill is not installed, do the behaviour it names and say so in the handoff.

---

## What is already decided (4 September) — do not re-litigate

- **Motion Canvas runs live in the browser**, no editor, no vite plugin, one `mc.js`. The proof
  exists: `tmp/wp36/motion_canvas_src.tgz` in this repository (untracked; copied from the 4 September
  demo) has `src/main.ts` — `bootstrap` + `Player` + `Stage` by hand, `window.mc.mount(el, sceneName, data)`
  returning `{play, destroy, canvas, player}`, variables through `player.setVariables` — and two
  scenes, `agreement` and `transform`, written against Learning Routes' palette. Start from it.
- **Scenes are TypeScript written once; the model writes a few lines of JSON per lesson.** The
  model never writes animation code.
- **Narration is ElevenLabs, and the animation follows the voice**, not the other way round: the
  word times come from the TTS response and the scene lights the word when the voice says it.
- **The free module gets one or two narrated scenes.** They are the showcase — the product in
  fifteen seconds. Cost lands on top of the free-tier number (WP-20 recalculates with it).
- **Preview audio is generated on demand** (WP-20 §C: no narration prefetch for preview modules;
  paid modules keep pre-generating). Narrated scenes follow the same rule.
- **Seven scene patterns is about a week of craft.** This package ships **two** — the two that
  exist — plus the plumbing that makes the other five a scene file each.

---

## §1 — The runtime, served from `:self`

`app/motion/` holds the source (`main.ts`, `scenes/*.tsx`, `vite.config.ts`, `package.json`,
`tsconfig.json`) — the tarball's contents, cleaned of the demo's `probe.tsx`. The build is
`vite build` → one IIFE, committed at `vendor/javascript/mc.js`. There is **no node in the
Dockerfile** (`tailwindcss-rails` ships a binary; the image never runs npm), so the artifact is
committed, and committing an artifact is only honest if it cannot drift from its source: the build
writes a header comment with the SHA-256 of `app/motion/src/**` and the versions of
`@motion-canvas/core` and `2d`, and a test recomputes the hash and fails when `app/motion/src`
changed without a rebuild. `bin/motion-build` is the one documented command.

CSP is `script_src :self, "https://cdn.jsdelivr.net"` (`content_security_policy.rb:18`) — a file
under `vendor/javascript` is `:self`, so nothing changes there. Load it lazily, the way
`mermaid_diagram_controller.js` lazy-imports Mermaid: the 186 KB does not ship on lessons that
have no scene. `prefers-reduced-motion` is honoured the way `route_journey_controller.js` does it:
the scene renders its **final frame** and the narration still plays.

## §2 — `motion` is a block like the others

`ContentEngine::LessonBlocks::BLOCKS` is the single source of truth and its own comment says what
adding a type means: a parser branch, a partial, a Stimulus controller, an entry, and a prompt
section — and the contract test (`lesson_block_contract_test.rb`) fails until all of them exist.
That is the whole checklist; follow it in that order.

Authoring shape — heading-authored, like `## Visual:`, with a JSON fence as the body:

```
## Motion: agreement
```json
{ "tokens": ["He", "have", "coffee", "."], "subject": 0, "verb": 1,
  "wrong": "have", "correct": "has",
  "why": "«He» es tercera persona: has, no have.",
  "narration": "Mira el sujeto. «He» es tercera persona, así que el verbo lleva -s: has, no have." }
```
```

The heading's title **is the scene name**, from a closed vocabulary (`agreement`, `transform` for
now); the parser emits `{ type: "motion", scene:, data:, narration:, body: }` and — this is the
part that decides whether a bad generation reaches a student — **validates `data` against the
scene's schema on the Ruby side** (`ContentEngine::MotionScenes::SCHEMAS[scene]`: required keys,
types, array lengths, indexes in range). Invalid or unknown scene → the block is emitted as a
`concept` whose body is the narration text, and the parser logs why, the way it logs a dropped
`:::` block. *A default may render less; it may never render something false.*

The partial `_motion.html.erb` mounts `motion_scene_controller.js` with the scene name, the data
and the narration endpoints; the controller lazy-loads `mc.js`, mounts the scene, and owns the
play button. The scene file exposes what the model's JSON needs and nothing else; `FALLBACK` data
in the scene stays, for the editorless preview page you will want while developing.

The prompt: `lesson_content.yml` gets a `## Motion:` section teaching the syntax, the two scene
names, their JSON shapes and the narration rule (one to three sentences, in the route's locale,
naming the thing the scene shows). Where it goes in the cycle is a content decision the owner
took: **module 1 lessons carry one, at most two, motion blocks; other modules none until Task 8** —
the generator learns this from `curriculum_design.yml` or from a pipeline option, whichever the
contract test can pin; do not hardcode it in the parser. The contract test's existing assertions
("every ## heading the prompt requests maps to a known type", "every declared type has a partial")
will hold you to it.

## §3 — Narration with word times, through the one client

`AiOrchestrator::AiClient#request_elevenlabs` (`ai_client.rb:89-139`) posts to
`/v1/text-to-speech/{voice_id}` with `Accept: audio/mpeg`. ElevenLabs'
`/v1/text-to-speech/{voice_id}/with-timestamps` returns JSON — `audio_base64` plus `alignment`
(`characters`, `character_start_times_seconds`, `character_end_times_seconds`). Add a
`timestamps: true` param that switches the endpoint, decodes the audio, and returns `alignment`
alongside `content`. Word times are derived from the character alignment (a word is a run of
non-space characters; its start is its first character's start, its end its last character's end).
Everything else stays: `SpendGuard.call` at `:27` runs before either endpoint, `SpeechCostRecorder.record_tts!`
prices it — check whether the `character-cost` header exists on the timestamps endpoint; if it
does not, bill `text.length` and say so in the handoff, because the ledger must not show $0.00 for
a paid call (roadmap debt: `openai_chat` already does that).

Storage: **one narration path, not two.** `SectionAudioGenerator` already generates, caches
(`Rails.cache`, 7 days), stores the mp3 under `storage/audio/sections/`, and writes
`audio_sections[index]` under `with_lock` + `merge_metadata!` (WP-33 §1 discipline). Extend it: a
`timestamps:` option, the word array stored in `audio_sections[index]["words"]` (top-level key,
never inside `parsed_sections` — that array is the parser's, and `SectionEnrichment::KEYS` is the
list of exceptions; do not grow it for this). `SectionAudioController#generate`/`#status` serve the
motion block too, with `words` in the status payload when present.

**Prefetch — corrected after the agent's brainstorm question (11 September).** `MediaPrefetchJob#perform:24`
returns unless `@step.preview_access?`, and `ContentPipelineJob:24` does the same: today **only preview
steps are ever generated**; purchased modules produce nothing until Task 8 lifts those gates (audit §3.4).
So "paid modules pre-generate" is a decided rule that is dormant, not a path that exists, and a test
that says "a paid step enqueues one" cannot go green without lifting a gate that is Task 8's decision
and a spend decision. WP-36 does **not** lift it. Instead: the audio branch of `build_media_tasks`
(`media_prefetch_job.rb:96`, where `%w[concept summary]` is decided) becomes one method that takes the
module's access state — `narration_prefetch_types(access_state)` — returning `concept summary motion`
for `purchased` and, for `preview`, what it returns today (`concept summary`; **not** `motion`, which is
on demand by the decided rule — and not the WP-20 §C reduction either, which is WP-20's change, not
this package's). When Task 8 lifts the `:24` return, motion narration on purchased modules starts
prefetching with no change here. Say in the handoff that the purchased half is dormant by design.

## §4 — The voice leads, the picture follows

The controller receives `words` and hands the scene a `cues` variable: for each token the scene
animates, the second at which the voice says it (token → word matched by normalised text, first
unmatched token falls back to even spacing across the narration's duration — and the handoff says
how often the fallback fired on real data). The scene's timeline waits on cues, not on fixed
`waitFor`s, for the beats that name a word; beats that name nothing keep their durations.

Playback: audio and player start together; on `timeupdate` the controller compares
`audio.currentTime` with the player's time and seeks the player when the drift exceeds 120 ms
(Motion Canvas exposes `player.requestSeek` / `playback.seek(frame)` — pick the one the demo's
`Player` version has). Pause pauses both; ended shows the final frame; replay resets both. Reduced
motion: final frame from the start, audio plays.

Failure is visible and local (WP-35's rule): TTS refused by the guard → the block shows the
narration text and the scene plays without voice on its fixed timings, with the localized sentence
the AI tools use (`refuse_agent`'s partial or a sibling); `mc.js` failed to load → the narration
text and the play button for audio alone. Never a blank block, never an English literal.

## §5 — Nothing spends outside the guard (WP-34 §3.1 and §3.2, folded in)

`lesson_assistant_agent.rb:58` calls `RubyLLM.chat(model: "gpt-4.1-mini")` directly: no
`SpendGuard`, and its cost is recorded only if that path does it itself. `voice_evaluator.rb:46-64`
posts to `https://api.elevenlabs.io/v1/speech-to-text` with its own `Net::HTTP`, outside every
ceiling and the 20 rpm limit. Route both through `AiClient` (an `stt` request method next to
`request_elevenlabs`, `SpeechCostRecorder.record_stt!` already exists) so `SpendGuard.call` runs
and the ledger sees them.

**The class test:** a sweep over `app/**/*.rb` and `engines/*/app/**/*.rb` that fails on
`RubyLLM.chat`, `RubyLLM.paint`, `api.elevenlabs.io`, `api.openai.com` anywhere but
`ai_orchestrator/app/services/ai_orchestrator/ai_client.rb`. Red today on two files. It is what
keeps this package — which adds a new paid call — from being the third.

---

## The tests that prevent the classes

1. **"A declared block type is missing one of its five parts."** The existing contract test, which
   fails until parser branch, partial, controller, `BLOCKS` entry and prompt section all exist.
   Plus: an invalid `## Motion:` JSON renders as a concept with the narration, never as a blank or an
   error; an unknown scene name does the same.
2. **"A provider is called outside the guard."** The sweep of §5, red first.
3. **"The picture does not follow the voice."** A JS unit test (node, like `journey_layout_test.rb`)
   on the pure `cuesFor(tokens, words)` function: exact match, case/punctuation normalisation,
   the fallback, and the no-words case. A system test: a lesson with a motion block whose narration
   is a **fixture** (words and mp3 committed under `test/fixtures/files/` — no paid call in the
   suite) — press play, assert the scene canvas has a box, the audio element is playing, and that
   the token the fixture says is spoken at 1.2 s is highlighted after 1.2 s and not before.
4. **"The artifact drifted from its source."** The hash test of §1.
5. **"Preview prefetches the motion narration, or the gate moved."** A preview step with a motion
   block enqueues **no** audio task for the motion section (its concept/summary tasks unchanged) — red
   first if `motion` is naively appended to the `%w[concept summary]` list. A purchased step still
   enqueues **nothing at all**, pinned with a comment naming Task 8 as the owner of that gate — so this
   package cannot lift it by accident. And a unit test on `narration_prefetch_types(:purchased)`
   includes `motion`, so the dormant half is real code with a real test, not a sentence.
6. **"The narration write erases a sibling."** `audio_sections[index]["words"]` written while another
   index is written concurrently: both survive (the WP-19 harness pattern; `step_metadata_write_isolation_test.rb`
   is the file).

## Order

1. §5 first — small, red first, and it is the fence around everything after it.
2. §1 runtime and the hash guard.
3. §2 the block, through the contract test.
4. §3 narration with timestamps, through the one client and the one generator.
5. §4 sync, reduced motion, failure states.
6. One real lesson generated in development with the prompt change — **one paid call, say its cost**
   — and rendered end to end: that is the production-path evidence. Nothing is ✅ without it.

## Verification

Before and after, the three suites three times each from a clean base, as `WP33_HANDOFF.md`
tabulates them (the four known engine failures and nothing else); RuboCop clean. In a browser
against dev: the fixture lesson plays with the word lighting on the voice; drift stays under
120 ms across a 20 s narration (log it); reduced-motion shows the final frame; the guard-refused
state and the no-`mc.js` state both read as a sentence in the student's language.

Write `WP36_HANDOFF.md`: what changed, the red-then-green of every new test, the spec and plan paths,
the measured first-play latency on a preview step (WP-20 §C asked for this and it was never
measured), the cost of the one generated lesson, the cue fallback rate, and what you did not do.

## Not in this package

The other five scene patterns (one file each, after this lands). Phase screens and the measured
ETA (the three-phase generation package). Task 8 (paid module generation). WP-20's recalculated
free-tier number — this package gives it the input. Video files: nothing here renders or stores a
video; the scene is drawn live. Bilibili, TikTok, YouTube — that is the other repository.

---

## Brainstorm answers (11 September) — these supersede the wording above where they differ

1. **Prefetch and the preview gate** (§3, test 5). `MediaPrefetchJob:24` and `ContentPipelineJob:24`
   return unless the step is in the preview module; purchased modules generate nothing until Task 8.
   WP-36 does not lift either gate. `narration_prefetch_types(access_state)` returns
   `concept summary motion` for `:purchased` (dormant by design, with its own unit test) and today's
   `concept summary` for `:preview` — motion is on demand there. A purchased step still enqueues
   nothing, pinned with a comment naming Task 8.
2. **The scene schema is a file, and it is the only copy** (§2). `app/motion/src/scenes/<name>.schema.json`,
   draft 2020-12, `additionalProperties: false`, `examples: [<fallback>]`, one vendor keyword
   `x-index-into` for index-into-array rules. Four consumers read it: `ContentEngine::MotionScenes`
   (discovers the files at boot — the file set IS the vocabulary — validates `data` with `json_schemer`,
   already in `Gemfile.lock` via `mcp`, declare it in the Gemfile), the generated
   `src/generated/schemas.d.ts` (no hand-written `type` alias survives in a scene), the scene's
   `FALLBACK` (= `schema.examples[0]` via vite's JSON import), and the `## Motion:` example in
   `lesson_content.yml` (a contract test validates it against the schema its heading names). The
   block JSON is `{ "narration": "...", "data": { … } }`: Ruby owns `narration`, the schema owns `data`.
   **Language-neutral by contract**: no schema constrains a string to Latin script or English; the
   prompt example uses a non-English target; the system test's fixture renders one non-Latin token
   (CJK or Arabic) with no missing-glyph box, and the handoff names the font fallback that makes it true.
3. **Freshness hashes** (§1). Every build input under `app/motion/` except `dist/` and `node_modules/`,
   files only, sorted, hashed as path + content, lockfile included. Two derived artifacts, two headers,
   two Ruby tests: `vendor/javascript/mc.js` carries the hash of all inputs; `src/generated/schemas.d.ts`
   carries the hash of `src/scenes/*.schema.json` only. Inputs enumerated with `Dir.glob` and an exclude
   list, never by shelling to git. `bin/motion-build` is the only writer of both headers.
4. **Who turns word times into cues** (§4). **The scene, through one shared helper.** The controller
   mounts with `{ data, words }` and owns sync only (audio ↔ player drift, pause, ended, replay,
   reduced motion). `app/motion/src/lib/cues.ts` — pure, no Motion Canvas imports, node-tested like
   `journey_layout.js` — exposes `cueFor(text, words, from)` (normalised match, searching forward from
   the previous cue so a repeated word resolves in order; returns `null` on a miss) and the scene calls
   it for each beat that names a word, waiting on the scene clock (`waitUntilTime`, same lib) and
   falling back to the beat's fixed duration on `null` or when `words` is absent. Nothing in the
   schema declares "which field is spoken" — that is scene knowledge and it stays in the scene;
   `transform`'s per-step `tokens` are exactly why. The helper counts misses and the scene reports
   them (`cueStats`) so the controller can log the fallback rate the handoff asks for. Ruby never
   computes cues.
