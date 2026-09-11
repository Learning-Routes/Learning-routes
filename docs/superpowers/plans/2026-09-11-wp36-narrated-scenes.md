# WP-36 Narrated Scenes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `motion` lesson block — a Motion Canvas scene drawn live in the browser and narrated by ElevenLabs, with the animation following the voice — and put the two remaining unguarded provider calls behind `SpendGuard` first.

**Architecture:** One committed IIFE (`vendor/javascript/mc.js`) built from `app/motion/` and lazy-imported, so lessons without a scene never fetch it. A scene's data shape lives in exactly one file (`<scene>.schema.json`) read by four consumers. The scene computes its own word cues from the TTS alignment through one pure helper; the Stimulus controller owns audio↔player sync only. Two composing SHA-256 headers make the committed artifact unable to drift from its source.

**Tech Stack:** Rails 8.1, Motion Canvas 3.17.2 (`core` + `2d`), vite 8 (build only — the image has no node), `json_schemer` 2.5.0, importmap + Stimulus, Minitest + Capybara/headless Chrome.

**Spec:** `docs/superpowers/specs/2026-09-11-wp36-narrated-scenes-design.md` — read it first; this plan argues from it.

## Global Constraints

Every task's requirements implicitly include these.

- **English throughout** in code, comments, commit messages and docs.
- **Nothing that spends money does so outside `SpendGuard`.** `AiClient#chat` (`ai_client.rb:27`) is the only place a provider is called.
- **No node in the Docker image.** `bin/motion-build` and the `cues.ts` unit test need node locally; nothing at runtime or in the hash tests does.
- **Node floor ≥ 23.6** (native TypeScript type stripping). Measured on this machine: v25.9.0. Tests needing node **skip with an explicit message**, never silently.
- **No literal displayed string in a `.tsx`.** Every displayed string reaches a scene through `data` or an i18n bag at mount.
- **No schema constrains a string to Latin script or English.**
- **Scene font stack, exactly:** `'DM Sans', 'Hiragino Sans GB', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', system-ui, sans-serif`
- **Language placement:** `data.tokens` / `data.wrong` / `data.correct` are the **target** language; `data.why`, `data.labels.*` and `narration` are the **student's** language.
- **Metadata:** word arrays go to `audio_sections[index]["words"]` — a top-level key. `SectionEnrichment::KEYS` does **not** grow. All metadata writes use `with_lock` + `merge_metadata!`.
- **No paid call in the test suite.** The system test uses a committed fixture mp3 + word array.
- **TDD:** observe the test red before writing the code. For a guard test added beside a fix, **break the fix and watch that specific test go red** — WP-33 round two shipped a guard whose fixture contained an earlier sufficient cause, so it passed without reaching the mechanism it named.
- **One test suite at a time.** This runner shares a test DB; concurrent runs manufacture flakiness.

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `app/motion/package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json` | build config; the lockfile is a hash input |
| `app/motion/src/main.ts` | `window.mc.mount(el, scene, {data, words, onToken})` |
| `app/motion/src/lib/cues.ts` | pure `cueFor` / `waitUntilTime` / `cueStats`; no Motion Canvas imports |
| `app/motion/src/scenes/agreement.tsx`, `transform.tsx` | the two scenes |
| `app/motion/src/scenes/agreement.schema.json`, `transform.schema.json` | **the only copy** of each scene's data shape |
| `app/motion/src/generated/schemas.d.ts` | generated types; committed; carries its own hash header |
| `bin/motion-build` | the one documented build command; only writer of either header |
| `vendor/javascript/mc.js` | the committed artifact |
| `engines/content_engine/app/services/content_engine/motion_scenes.rb` | schema discovery + `data` validation |
| `engines/content_engine/app/services/content_engine/motion_build.rb` | `digest_for` — pure, `Dir.glob`, never shells to git |
| `engines/.../app/views/.../lesson_sections/_motion.html.erb` | mounts the controller |
| `app/javascript/controllers/motion_scene_controller.js` | lazy-load, sync, failure states |
| `test/services/content_engine/provider_guard_sweep_test.rb` | the fence |
| `test/services/content_engine/motion_build_freshness_test.rb` | the two hashes |
| `test/services/content_engine/motion_scenes_test.rb` | schema discovery + validation |
| `test/services/content_engine/motion_scene_chrome_test.rb` | no literals in a `.tsx` |
| `test/javascript/motion_cues_test.rb` | node unit tests on `cueFor` |
| `test/system/motion_scene_test.rb` | fixture narration, end to end |
| `test/fixtures/files/motion_narration.mp3`, `motion_narration_words.json` | the fixture; no paid call |

**Modified**

| Path | Change |
|---|---|
| `Gemfile` | declare `json_schemer` explicitly (already in the lock via `mcp`) |
| `.../ai_orchestrator/ai_client.rb` | `timestamps:` on `request_elevenlabs`; new `request_elevenlabs_stt` |
| `.../content_engine/lesson_assistant_agent.rb:58` | `RubyLLM.chat` → `AiClient` |
| `engines/assessments/.../voice_evaluator.rb` | own `Net::HTTP` → `AiClient` |
| `.../content_engine/lesson_blocks.rb` | `"motion"` entry |
| `.../content_engine/lesson_section_parser.rb` | `## Motion:` branch |
| `.../content_engine/section_audio_generator.rb` | `timestamps:` option, `words` storage |
| `.../content_engine/section_audio_controller.rb` | serve motion; `words` in status |
| `.../content_engine/media_prefetch_job.rb` | `narration_prefetch_types(access_state)` |
| `config/importmap.rb` | pin `mc` to `mc.js` |
| `engines/ai_orchestrator/config/prompts/lesson_content.yml` | `## Motion:` section |
| `test/application_system_test_case.rb` | autoplay flag **only if** the browser refuses |

---

## Tasks 1–3 — Brief §5: the fence

These three are independently shippable: they fix WP-34 §3.1/§3.2 and are worth merging even if the rest of WP-36 stalls.

### Task 1: The provider sweep, red first

**Files:**
- Test: `test/services/content_engine/provider_guard_sweep_test.rb` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: a failing test naming the two offenders. No production code.

- [ ] **Step 1: Write the failing test**

```ruby
require "test_helper"

# THE CLASS: a provider is called outside SpendGuard.
#
# `AiClient#chat` calls `SpendGuard.call` at ai_client.rb:27 BEFORE any request,
# so it is the only place a ceiling has to be checked to be checked everywhere.
# A call that reaches a provider by any other route spends money no ceiling saw
# and writes no ledger row.
#
# Shaped like WP-33's enrichment sweep, which is the shape that survives its own
# fix: this asserts ZERO offenders, and the companion test below asserts the
# sweep is looking at what it thinks it is. "Exactly two offenders" would be an
# artifact of today's red that this package's own commit would have to invert.
class ProviderGuardSweepTest < ActiveSupport::TestCase
  GLOB = "{app,engines/*/app}/**/*.rb"

  # The one file allowed to name a provider: it is what runs the guard.
  ALLOWED = "engines/ai_orchestrator/app/services/ai_orchestrator/ai_client.rb"

  PATTERNS = {
    "RubyLLM.chat"       => /RubyLLM\.chat\b/,
    "RubyLLM.paint"      => /RubyLLM\.paint\b/,
    "api.elevenlabs.io"  => %r{api\.elevenlabs\.io},
    "api.openai.com"     => %r{api\.openai\.com}
  }.freeze

  def scanned_files
    Dir[Rails.root.join(GLOB)].reject { |f| f.end_with?(ALLOWED) }
  end

  test "no provider is called outside AiClient" do
    offenders = scanned_files.flat_map do |path|
      source = File.read(path)
      PATTERNS.filter_map do |name, re|
        "#{Pathname.new(path).relative_path_from(Rails.root)} — #{name}" if source.match?(re)
      end
    end

    assert_equal [], offenders.sort,
      "these reach a provider without SpendGuard.call, so they spend money no ceiling " \
      "saw and write no ledger row. Route them through AiOrchestrator::AiClient."
  end

  # Without this, a glob that silently stopped matching would report zero
  # offenders and look like success. An empty sweep is a broken sweep until
  # proven otherwise.
  test "the sweep is looking at the files it thinks it is" do
    all = Dir[Rails.root.join(GLOB)]

    assert_operator all.size, :>=, 100,
      "the glob stopped matching the tree; the class test above would pass vacuously"
    assert all.any? { |f| f.end_with?(ALLOWED) },
      "ai_client.rb is outside the glob, so the sweep is not reaching provider code at all"
  end
end
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bin/rails test test/services/content_engine/provider_guard_sweep_test.rb`
Expected: **1 failure** (`no provider is called outside AiClient`) naming exactly two files — `lesson_assistant_agent.rb — RubyLLM.chat` and the voice evaluator — and the companion test **passing**. If the companion test fails, fix the glob before going on; a red sweep over nothing proves nothing.

- [ ] **Step 3: Commit the red test**

```bash
git add test/services/content_engine/provider_guard_sweep_test.rb
git commit -m "test(spend): a provider called outside AiClient is a test failure

Red on two files: LessonAssistantAgent#build_chat and VoiceEvaluator's own
Net::HTTP. Both spend money no ceiling saw. Tasks 2 and 3 make it green."
```

### Task 2: Route the STT call through AiClient

**Files:**
- Modify: `engines/ai_orchestrator/app/services/ai_orchestrator/ai_client.rb`
- Modify: `engines/assessments/app/services/assessments/voice_evaluator.rb`
- Test: `test/services/content_engine/provider_guard_sweep_test.rb` (existing)

**Interfaces:**
- Consumes: `SpendGuard.call`, `SpeechCostRecorder.record_stt!` (both exist).
- Produces: `AiClient#stt(file_path:, params: {})` → `{content:, model:, latency_ms:, duration_seconds:}`. Task 12 adds a sibling on the TTS side; the two do not share code beyond `chat`'s guard.

- [ ] **Step 1: Read the current call site**

Run: `sed -n '40,80p' engines/assessments/app/services/assessments/voice_evaluator.rb`
Note the multipart form (`file`, `model_id`), `STT_MODEL`, the `TranscriptionError` on non-2xx, and `record_failed_transcription!`. All of that behaviour is preserved — only *where the HTTP happens* changes.

- [ ] **Step 2: Add `stt` to AiClient, guarded**

In `ai_client.rb`, beside `request_elevenlabs`:

```ruby
    # Speech-to-text, through the same front door as everything else.
    #
    # This used to live in VoiceEvaluator with its own Net::HTTP, which meant no
    # SpendGuard ceiling, no rate limit, and a paid call the ledger never saw
    # (WP-34 §3.2). The transport is unchanged — multipart, Scribe, same errors —
    # it is the guard in front of it that is new.
    def stt(file_path:, params: {})
      SpendGuard.call(model: "elevenlabs_stt", task_type: :speech_to_text, user: @user)
      request_elevenlabs_stt(file_path: file_path, params: params)
    end
```

and the private request method, moved verbatim from `VoiceEvaluator` (multipart body, `xi-api-key`, 10s open / 60s read), returning:

```ruby
      {
        content: response.body,
        model: "elevenlabs_stt",
        model_id: params[:model_id] || STT_MODEL,
        latency_ms: elapsed_ms
      }
```

- [ ] **Step 3: Call it from VoiceEvaluator**

Replace the `Net::HTTP` block with:

```ruby
      result = AiOrchestrator::AiClient
                 .new(model: "elevenlabs_stt", task_type: :speech_to_text, user: @user)
                 .stt(file_path: audio_path, params: { model_id: STT_MODEL })
      AiOrchestrator::SpeechCostRecorder.record_stt!(
        user: @user, result: result, duration_seconds: duration
      )
```

Keep `record_failed_transcription!` on the error path: rescue `AiClient::RequestError` where the HTTP status check used to be, so a refusal and a 5xx behave as they did.

- [ ] **Step 4: Run the sweep and the voice tests**

Run: `bin/rails test test/services/content_engine/provider_guard_sweep_test.rb`
Expected: still 1 failure, now naming **one** file (`lesson_assistant_agent.rb`).

Run: `bin/rails test engines/assessments/test`
Expected: PASS. If a test stubbed `Net::HTTP` directly it now stubs the wrong seam — restub on `AiClient#stt` and say so in the commit.

- [ ] **Step 5: Prove the guard is actually in front**

Add to the voice evaluator's test file:

```ruby
  test "a refused ceiling stops the STT call before any HTTP" do
    AiOrchestrator::SpendGuard.stub(:call, ->(**) { raise AiOrchestrator::SpendGuard::Refused, "ceiling" }) do
      assert_raises(AiOrchestrator::SpendGuard::Refused) { subject.transcribe!(blob_key) }
    end
  end
```

Then **break the fix** — comment out the `SpendGuard.call` line in `stt` — and confirm *this test* goes red. Restore it. (Use the actual `Refused` class name from `spend_guard.rb`; read it before writing this step.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(spend): route speech-to-text through AiClient so SpendGuard sees it

WP-34 §3.2. VoiceEvaluator posted to api.elevenlabs.io with its own Net::HTTP:
outside every ceiling and outside the 20 rpm limit. Transport unchanged, guard
new. Verified by breaking the guard and watching the new test go red."
```

### Task 3: Route the assistant chat through AiClient

**Files:**
- Modify: `engines/content_engine/app/services/content_engine/lesson_assistant_agent.rb`
- Test: `test/services/content_engine/provider_guard_sweep_test.rb` (existing)

**Interfaces:**
- Consumes: `AiClient` (existing `chat`), `SpendGuard`.
- Produces: nothing new; `build_chat` keeps its name and returns an object responding to the same methods the tool loop uses.

- [ ] **Step 1: Read what build_chat's return value must support**

Run: `grep -n "chat\.\|@chat" engines/content_engine/app/services/content_engine/lesson_assistant_agent.rb`
`with_instructions`, `with_tools` and the completion call must keep working. `RubyLLM.chat` is `AiClient`'s own `chat_via_ruby_llm` path, so the object shape is available — this is about the call going through the guarded front door, not about replacing the library.

- [ ] **Step 2: Change the call**

```ruby
    def build_chat
      # Through AiClient, not RubyLLM directly: ai_client.rb:27 runs SpendGuard
      # before the request and records the interaction. Called directly, this
      # agent spent money no ceiling saw (WP-34 §3.1).
      AiOrchestrator::AiClient
        .new(model: "gpt-4.1-mini", task_type: :lesson_assistant, user: @user)
        .chat_session(system_prompt: system_prompt, tools: TOOLS)
    end
```

Add `chat_session` to `AiClient` if no equivalent exists: it runs `SpendGuard.call`, then returns the configured `RubyLLM` chat object. Keep the guard in `AiClient`, never in the agent.

- [ ] **Step 3: Run the sweep**

Run: `bin/rails test test/services/content_engine/provider_guard_sweep_test.rb`
Expected: **PASS, 2 runs, 0 failures.** The fence is closed.

- [ ] **Step 4: Run the assistant's own tests**

Run: `bin/rails test engines/content_engine/test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(spend): route the lesson assistant through AiClient

WP-34 §3.1. The sweep is green: no provider is reached outside ai_client.rb."
```

---

## Tasks 4–7 — Brief §1: the runtime and the two hashes

### Task 4: The `app/motion` source tree

**Files:**
- Create: `app/motion/{package.json,package-lock.json,vite.config.ts,tsconfig.json}`
- Create: `app/motion/src/main.ts`, `app/motion/src/scenes/{agreement,transform}.tsx`
- Create: `app/motion/src/scenes/{agreement,transform}.schema.json`
- Create: `app/motion/src/lib/cues.ts`
- Source: `tmp/wp36/motion_canvas_src.tgz` (untracked, in this repo)

**Interfaces:**
- Consumes: nothing.
- Produces: `window.mc.mount(el, sceneName, {data, words, onToken})` → `{play(next?), destroy(), canvas, player, cueStats()}`; from `lib/cues.ts`: `cueFor(text, words, from) -> number|null`, `remainingUntil(t, now) -> number`, `cueStats() -> {asked, missed}`, `resetCueStats()`. Tasks 5, 6, 9, 16 depend on these exact names.
- **Naming note:** the spec calls the waiter `waitUntilTime(t)`. It cannot live in `cues.ts`, which must stay Motion-Canvas-free to run under node — so `cues.ts` exports the pure `remainingUntil(t, now)` and each scene keeps a three-line `waitUntilTime` wrapper that yields `waitFor(remainingUntil(t, useScene().playback.time))`. Same API at the call site, pure module underneath.

- [ ] **Step 1: Extract the demo and drop `probe.tsx`**

```bash
mkdir -p app/motion && tar xzf tmp/wp36/motion_canvas_src.tgz -C /tmp/mcsrc --strip-components=1
cp -R /tmp/mcsrc/{package.json,tsconfig.json,vite.config.ts,src} app/motion/
rm app/motion/src/scenes/probe.tsx
```

- [ ] **Step 2: Write the two schemas — the only copy of each data shape**

`app/motion/src/scenes/agreement.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "agreement",
  "type": "object",
  "additionalProperties": false,
  "required": ["tokens", "subject", "verb", "wrong", "correct", "why", "labels"],
  "properties": {
    "tokens":  { "type": "array", "minItems": 2, "items": { "type": "string", "minLength": 1 } },
    "subject": { "type": "integer", "minimum": 0, "x-index-into": "tokens" },
    "verb":    { "type": "integer", "minimum": 0, "x-index-into": "tokens" },
    "wrong":   { "type": "string", "minLength": 1 },
    "correct": { "type": "string", "minLength": 1 },
    "why":     { "type": "string", "minLength": 1 },
    "labels": {
      "type": "object",
      "additionalProperties": false,
      "required": ["subject", "verb"],
      "properties": {
        "subject": { "type": "string", "minLength": 1 },
        "verb":    { "type": "string", "minLength": 1 }
      }
    }
  },
  "examples": [
    {
      "tokens": ["Ele", "tenho", "café", "."],
      "subject": 0, "verb": 1,
      "wrong": "tenho", "correct": "tem",
      "why": "«Ele» es tercera persona: tem, no tenho.",
      "labels": { "subject": "SUJETO", "verb": "VERBO" }
    }
  ]
}
```

No `pattern` keyword anywhere: a regex is how a Latin-script assumption gets in. `minLength: 1` is the only string constraint.

`transform.schema.json` mirrors it for `{steps: [{tag, tokens, hi}]}`, with `hi` an array of integers and `"x-index-into": "tokens"` **scoped to the step** — record in the schema comment that the Ruby post-pass resolves `x-index-into` against the *containing object*, so `hi` inside a `steps` item indexes that item's `tokens`.

- [ ] **Step 3: Write `src/lib/cues.ts` — pure, no Motion Canvas imports**

```ts
// The voice leads and the picture follows, and this is the only place that
// decides when. Pure on purpose: no Motion Canvas imports, so node can run it
// directly (see test/javascript/motion_cues_test.rb), the same way
// app/javascript/lib/journey_layout.js is tested.
export type Word = {text: string; start: number; end: number};

const norm = (s: string): string =>
  s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '');

let asked = 0;
let missed = 0;

// Searches FORWARD from `from` so a word the narration repeats resolves in the
// order it is spoken, not always to the first occurrence. Returns null on a
// miss, and the caller falls back to that beat's fixed duration.
export function cueFor(text: string, words: Word[] | null | undefined, from = 0): number | null {
  asked++;
  if (!words || words.length === 0) { missed++; return null; }
  const needle = norm(text);
  if (!needle) { missed++; return null; }
  for (let i = Math.max(0, from); i < words.length; i++) {
    if (norm(words[i].text) === needle) return words[i].start;
  }
  missed++;
  return null;
}

export function cueStats(): {asked: number; missed: number} { return {asked, missed}; }
export function resetCueStats(): void { asked = 0; missed = 0; }
```

`waitUntilTime(t)` lives here too but imports the clock from its caller, so this file stays Motion-Canvas-free:

```ts
// Waits on the SCENE clock until absolute second `t`. Never waits backwards:
// a cue already passed (drift, a seek) resolves immediately rather than hanging.
export function remainingUntil(t: number, now: number): number {
  return Math.max(0, t - now);
}
```

- [ ] **Step 4: De-literalise the scenes**

In `agreement.tsx`: delete the `type Agreement` alias and the `FALLBACK` const; import the type from `../generated/schemas`; take the fallback from the schema:

```tsx
import schema from './agreement.schema.json';
import type {Agreement} from '../generated/schemas';
const FALLBACK = schema.examples[0] as Agreement;
```

Replace `'SUJETO'` / `'VERBO'` with `d.labels.subject` / `d.labels.verb`. Apply the Global-Constraints font stack to every `fontFamily`.

- [ ] **Step 5: Teach `main.ts` the new mount signature**

```ts
type MountOpts = {
  data?: Record<string, unknown>;
  words?: Word[] | null;
  onToken?: (index: number | null) => void;
};

function mount(el: HTMLElement, sceneName: string, opts: MountOpts = {}): Handle {
  // ...as the demo, plus:
  resetCueStats();
  if (opts.data || opts.words) {
    player.setVariables({[sceneName]: opts.data ?? {}, words: opts.words ?? null, onToken: opts.onToken ?? null});
  }
  // ...and the handle re-exports the counter so the controller can log the
  // fallback rate the handoff asks for without importing the module itself:
  //   return {canvas, player, play, destroy, cueStats};
```

A scene calls `useScene().variables.get('onToken', null)()?.(i)` as each beat lights a token. That callback is the only thing a system test can read off a canvas (Task 18).

- [ ] **Step 6: Install and check it compiles**

```bash
cd app/motion && npm install && npx vite build && ls -la dist/mc.js
```
Expected: `dist/mc.js` exists. Commit `package-lock.json` — it is a hash input.

- [ ] **Step 7: Commit**

```bash
git add app/motion
git commit -m "feat(motion): the scene source tree, schemas first

Two scenes from the 4 September demo, probe.tsx dropped. Each scene's data
shape is one JSON schema and nothing else declares it: the TS type is generated
from it, FALLBACK is its examples[0], Ruby validates against it. SUJETO/VERBO
move into data.labels — a Spanish lesson must not be baked into a .tsx every
route renders."
```

### Task 5: `bin/motion-build` and the two freshness hashes

**Files:**
- Create: `bin/motion-build`
- Create: `engines/content_engine/app/services/content_engine/motion_build.rb`
- Create: `test/services/content_engine/motion_build_freshness_test.rb`
- Create: `vendor/javascript/mc.js`, `app/motion/src/generated/schemas.d.ts` (build output, committed)
- Modify: `config/importmap.rb`

**Interfaces:**
- Consumes: the source tree from Task 4.
- Produces: `MotionBuild.digest_for(:artifact)` and `MotionBuild.digest_for(:schemas)` → 64-char hex; `MotionBuild.header_digest(path)` → the hex recorded in a built file, or `nil`.

- [ ] **Step 1: Write the failing test**

```ruby
require "test_helper"

# THE CLASS: a committed build artifact drifts from its source.
#
# The image has no node, so mc.js is committed rather than built at deploy.
# Committing an artifact is only honest if it cannot silently disagree with the
# source it claims to be built from — otherwise the repo ships a file nobody can
# reproduce and nobody notices.
#
# Two derived artifacts, two headers, two checks, composing without circularity:
# mc.js covers EVERY build input (schemas.d.ts included, because it is an
# input); schemas.d.ts covers the schemas only, and its own check proves it
# matches them.
class MotionBuildFreshnessTest < ActiveSupport::TestCase
  test "mc.js was built from the source that is committed" do
    recorded = ContentEngine::MotionBuild.header_digest(ContentEngine::MotionBuild::ARTIFACT)
    assert recorded, "vendor/javascript/mc.js has no motion-src-sha256 header. Run bin/motion-build."
    assert_equal ContentEngine::MotionBuild.digest_for(:artifact), recorded,
      "app/motion changed without a rebuild. Run bin/motion-build and commit both outputs."
  end

  test "the generated types were built from the schemas that are committed" do
    recorded = ContentEngine::MotionBuild.header_digest(ContentEngine::MotionBuild::TYPES)
    assert recorded, "schemas.d.ts has no motion-schemas-sha256 header. Run bin/motion-build."
    assert_equal ContentEngine::MotionBuild.digest_for(:schemas), recorded,
      "a scene schema changed without regenerating the types, so Ruby validates a " \
      "shape the artifact does not implement."
  end

  # Without this, an exclude list that swallowed everything would make both
  # checks pass over an empty input set. An empty sweep is a broken sweep.
  test "the digest is looking at the inputs it thinks it is" do
    files = ContentEngine::MotionBuild.input_files(:artifact)

    assert_operator files.size, :>=, 8, "the input glob stopped matching app/motion"
    assert files.any? { |f| f.end_with?("main.ts") }
    assert files.any? { |f| f.end_with?("package-lock.json") },
      "the lockfile pins every dependency and must be an input"
    assert files.none? { |f| f.include?("/node_modules/") || f.include?("/dist/") }
  end

  test "a changed input changes the digest" do
    before = ContentEngine::MotionBuild.digest_for(:artifact)
    path = Rails.root.join("app/motion/src/main.ts")
    original = File.read(path)
    begin
      File.write(path, original + "\n// touched by a test\n")
      assert_not_equal before, ContentEngine::MotionBuild.digest_for(:artifact)
    ensure
      File.write(path, original)
    end
    assert_equal before, ContentEngine::MotionBuild.digest_for(:artifact)
  end
end
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bin/rails test test/services/content_engine/motion_build_freshness_test.rb`
Expected: FAIL — `uninitialized constant ContentEngine::MotionBuild`.

- [ ] **Step 3: Write `MotionBuild`**

```ruby
module ContentEngine
  # Pure and Dir.glob-based, NEVER shelling to git: these tests must run where
  # git is not available (a deployed console, a stripped CI image).
  module MotionBuild
    ROOT     = "app/motion"
    ARTIFACT = "vendor/javascript/mc.js"
    TYPES    = "app/motion/src/generated/schemas.d.ts"
    EXCLUDED = %w[dist node_modules].freeze

    ARTIFACT_HEADER = "motion-src-sha256"
    SCHEMAS_HEADER  = "motion-schemas-sha256"

    def self.input_files(kind)
      pattern = kind == :schemas ? "#{ROOT}/src/scenes/*.schema.json" : "#{ROOT}/**/*"
      Dir[Rails.root.join(pattern)]
        .select { |p| File.file?(p) }
        .reject { |p| EXCLUDED.any? { |d| p.include?("/#{d}/") } }
        .sort
    end

    # path + "\n" + content, so a rename or a move moves the digest too —
    # a file's location is part of what the build consumes.
    def self.digest_for(kind)
      sha = Digest::SHA256.new
      input_files(kind).each do |path|
        rel = Pathname.new(path).relative_path_from(Rails.root).to_s
        sha << rel << "\n" << File.binread(path)
      end
      sha.hexdigest
    end

    def self.header_digest(relative_path)
      file = Rails.root.join(relative_path)
      return nil unless File.exist?(file)

      File.foreach(file).first(5).each do |line|
        m = line.match(/(?:#{ARTIFACT_HEADER}|#{SCHEMAS_HEADER}):\s*([0-9a-f]{64})/)
        return m[1] if m
      end
      nil
    end
  end
end
```

- [ ] **Step 4: Write `bin/motion-build` — the only writer of either header**

```bash
#!/usr/bin/env bash
set -euo pipefail
# The one documented command. The image has no node; this runs on a developer
# machine and its outputs are committed.
cd "$(dirname "$0")/../app/motion"
npm ci
npx json-schema-to-typescript --bannerComment '' -i 'src/scenes/*.schema.json' -o src/generated/schemas.d.ts
# schemas.d.ts header FIRST: it is an input to the bundle below.
bin/rails runner 'puts ContentEngine::MotionBuild.digest_for(:schemas)' # prepended as a comment
npx vite build
# then prepend the artifact header to dist/mc.js and copy to vendor/javascript/mc.js
```

Write it out in full when implementing: compute the schemas digest, prepend `// motion-schemas-sha256: <hex>` to `schemas.d.ts`, run vite, compute the artifact digest **after** `schemas.d.ts` is final, prepend `// motion-src-sha256: <hex>` plus the two Motion Canvas versions as human-readable info, and copy to `vendor/javascript/mc.js`.

- [ ] **Step 5: Run the build, then the test**

Run: `bin/motion-build && bin/rails test test/services/content_engine/motion_build_freshness_test.rb`
Expected: **PASS, 4 runs.**

- [ ] **Step 6: Prove the test can fail (the WP-33 lesson)**

Append a comment to `app/motion/src/main.ts`, run the test **without** rebuilding, and confirm `mc.js was built from the source that is committed` goes red. Revert. A freshness test that has never been observed red is not a freshness test.

- [ ] **Step 7: Pin it in the importmap and commit**

```ruby
# Motion Canvas runtime — built by bin/motion-build, committed because the image
# has no node. Lazy-imported by motion_scene_controller.js, so a lesson with no
# scene never fetches the ~186 KB. `vendor/javascript` is :self under CSP.
pin "mc", to: "mc.js"
```

```bash
git add -A
git commit -m "feat(motion): bin/motion-build and two composing freshness hashes

mc.js covers every build input under app/motion except dist/ and node_modules/,
lockfile included, hashed as path + content so a move moves the hash.
schemas.d.ts covers the schemas only. Verified by touching main.ts and watching
the artifact test go red."
```

### Task 6: `cueFor` under node

**Files:**
- Create: `test/javascript/motion_cues_test.rb`

**Interfaces:**
- Consumes: `app/motion/src/lib/cues.ts` from Task 4.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Modelled on `test/javascript/journey_layout_test.rb`, which runs a pure module under node via `Open3` and asserts on its JSON — there is no JS test runner in this repo and this does not add one.

```ruby
require "test_helper"
require "json"
require "open3"

# The cue helper is pure so it can be asserted without a browser. Node runs
# TypeScript directly from v23.6 (type stripping); measured on this machine,
# v25.9.0. Below that floor the test SKIPS WITH A MESSAGE — never silently,
# because a silently-skipped test is indistinguishable from a passing one.
class MotionCuesTest < ActiveSupport::TestCase
  MODULE_PATH = Rails.root.join("app/motion/src/lib/cues.ts")

  WORDS = [
    {"text" => "Mira",   "start" => 0.0, "end" => 0.3},
    {"text" => "el",     "start" => 0.4, "end" => 0.5},
    {"text" => "sujeto", "start" => 0.6, "end" => 1.0},
    {"text" => "«Ele»",  "start" => 1.2, "end" => 1.6},
    {"text" => "sujeto", "start" => 2.0, "end" => 2.4}
  ].freeze

  def run_node(script)
    out, err, status = Open3.capture3("node", "--input-type=module", stdin_data: script)
    skip("node >= 23.6 required for TypeScript type stripping; got: #{err.lines.first}") unless status.success?
    JSON.parse(out)
  end

  def cue(text, words: WORDS, from: 0)
    run_node(<<~JS)
      import {cueFor} from #{MODULE_PATH.to_s.to_json};
      const r = cueFor(#{text.to_json}, #{words.to_json}, #{from});
      console.log(JSON.stringify({cue: r}));
    JS
  end

  test "an exact match returns the word's start" do
    assert_in_delta 1.2, cue("«Ele»")["cue"], 0.001
  end

  test "case and punctuation are normalised away" do
    assert_in_delta 1.2, cue("ele")["cue"], 0.001,
      "the token as the scene draws it will not match the transcript byte for byte"
  end

  test "a repeated word resolves forward, not always to the first occurrence" do
    assert_in_delta 0.6, cue("sujeto")["cue"], 0.001
    assert_in_delta 2.0, cue("sujeto", from: 3)["cue"], 0.001,
      "searching from the previous cue is what keeps a repeated word in spoken order"
  end

  test "a token the narration never says is a miss, not a wrong time" do
    assert_nil cue("café")["cue"],
      "returning a plausible-looking time for a word never spoken is worse than " \
      "falling back to the beat's fixed duration"
  end

  test "no words at all is a miss, not a crash" do
    assert_nil cue("Ele", words: [])["cue"]
  end
end
```

- [ ] **Step 2: Run it**

Run: `bin/rails test test/javascript/motion_cues_test.rb`
Expected: PASS (5 runs) if Task 4's `cues.ts` is correct; a genuine failure here is a bug in `cueFor`, not in the test — debug it with `superpowers:systematic-debugging`, not by loosening the assertion.

- [ ] **Step 3: Commit**

```bash
git add test/javascript/motion_cues_test.rb
git commit -m "test(motion): cueFor under node — forward search, normalisation, the miss"
```

### Task 7: `MotionScenes` — the schemas are the vocabulary

**Files:**
- Create: `engines/content_engine/app/services/content_engine/motion_scenes.rb`
- Create: `test/services/content_engine/motion_scenes_test.rb`
- Modify: `Gemfile`

**Interfaces:**
- Consumes: the schema files from Task 4.
- Produces: `MotionScenes.names -> ["agreement", "transform"]`; `MotionScenes.known?(name)`; `MotionScenes.validate(name, data) -> [] | [String]` (empty means valid). Task 8's parser branch calls exactly these.

- [ ] **Step 1: Declare the gem**

`Gemfile`: `gem "json_schemer", "~> 2.5"` — already resolved in `Gemfile.lock` at 2.5.0 via `mcp`, so `bundle install` changes nothing but the declaration. Verify: `bundle check`.

- [ ] **Step 2: Write the failing test**

```ruby
require "test_helper"

# The file set IS the vocabulary. There is no second list of scene names to
# drift from it — adding a scene is adding a schema and a .tsx, and the contract
# test in Task 11 fails if either is missing.
class MotionScenesTest < ActiveSupport::TestCase
  test "the scene vocabulary is discovered from the schema files" do
    assert_equal %w[agreement transform], ContentEngine::MotionScenes.names.sort
    assert ContentEngine::MotionScenes.known?("agreement")
    assert_not ContentEngine::MotionScenes.known?("nope")
  end

  test "every schema's own example validates against it" do
    ContentEngine::MotionScenes.names.each do |name|
      example = ContentEngine::MotionScenes.example(name)
      assert_equal [], ContentEngine::MotionScenes.validate(name, example),
        "#{name}.schema.json's examples[0] does not satisfy #{name}.schema.json — " \
        "and that example is the scene's FALLBACK, so the scene renders invalid data"
    end
  end

  test "a missing required key is reported, not swallowed" do
    data = ContentEngine::MotionScenes.example("agreement").except("verb")
    errors = ContentEngine::MotionScenes.validate("agreement", data)
    assert_not_empty errors
    assert errors.any? { |e| e.include?("verb") }, errors.inspect
  end

  test "an out-of-range index is rejected by the x-index-into pass" do
    data = ContentEngine::MotionScenes.example("agreement").merge("verb" => 99)
    errors = ContentEngine::MotionScenes.validate("agreement", data)
    assert errors.any? { |e| e.include?("verb") && e.include?("tokens") }, errors.inspect
  end

  test "an unexpected key is rejected" do
    data = ContentEngine::MotionScenes.example("agreement").merge("colour" => "red")
    assert_not_empty ContentEngine::MotionScenes.validate("agreement", data)
  end

  # The constraint that keeps this product usable outside Spanish and English.
  test "no schema constrains a string to a script or a language" do
    ContentEngine::MotionScenes.names.each do |name|
      raw = File.read(ContentEngine::MotionScenes.schema_path(name))
      assert_not_includes raw, '"pattern"',
        "#{name}.schema.json uses `pattern`, which is how a Latin-script assumption gets in"
    end
  end
end
```

- [ ] **Step 3: Run it and watch it fail**

Run: `bin/rails test test/services/content_engine/motion_scenes_test.rb`
Expected: FAIL — `uninitialized constant ContentEngine::MotionScenes`.

- [ ] **Step 4: Implement**

```ruby
require "json_schemer"

module ContentEngine
  module MotionScenes
    DIR = Rails.root.join("app/motion/src/scenes")

    def self.schema_path(name) = DIR.join("#{name}.schema.json")

    # Memoised per process, not per call: the parser runs this inside a job loop.
    def self.schemas
      @schemas ||= Dir[DIR.join("*.schema.json")].to_h do |path|
        [File.basename(path, ".schema.json"), JSON.parse(File.read(path))]
      end.freeze
    end

    def self.names   = schemas.keys.sort
    def self.known?(name) = schemas.key?(name.to_s)
    def self.example(name) = schemas.fetch(name.to_s)["examples"].first.deep_dup

    # Returns [] when valid, else human-readable messages. Never raises on bad
    # model output: the caller renders a concept instead (Task 8).
    def self.validate(name, data)
      return ["unknown scene #{name}"] unless known?(name)
      return ["data is not an object"] unless data.is_a?(Hash)

      schema = schemas.fetch(name.to_s)
      errors = JSONSchemer.schema(schema).validate(data).map do |e|
        "#{e['data_pointer'].presence || '/'}: #{e['type']}"
      end
      errors + index_errors(schema, data)
    end

    # `x-index-into` is the one vendor keyword: JSON Schema cannot say "this
    # integer indexes that array". Resolved against the CONTAINING object, so
    # `hi` inside a `steps` item indexes that item's `tokens`.
    def self.index_errors(schema, data, pointer = "")
      (schema["properties"] || {}).flat_map do |key, prop|
        value = data[key]
        target = prop["x-index-into"]
        errs = []
        if target && value.present?
          arr = data[target]
          Array(value).each do |i|
            errs << "#{pointer}/#{key}: #{i} is out of range for #{target}" unless arr.is_a?(Array) && i.is_a?(Integer) && i.between?(0, arr.size - 1)
          end
        end
        if prop["type"] == "array" && prop["items"].is_a?(Hash) && value.is_a?(Array)
          value.each_with_index { |item, i| errs += index_errors(prop["items"], item, "#{pointer}/#{key}/#{i}") if item.is_a?(Hash) }
        end
        errs
      end
    end
  end
end
```

- [ ] **Step 5: Run the test**

Run: `bin/rails test test/services/content_engine/motion_scenes_test.rb`
Expected: **PASS, 6 runs.**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(motion): MotionScenes discovers the schemas and validates data

The file set is the scene vocabulary — no second list to drift. json_schemer was
already resolved via mcp; it is now declared. x-index-into covers the one rule
JSON Schema cannot express, resolved against the containing object."
```

---

## Tasks 8–11 — Brief §2: `motion` is a block like the others

`LessonBlocks`' own comment gives the checklist and `lesson_block_contract_test.rb` fails until all five parts exist: parser branch, partial, Stimulus controller, `BLOCKS` entry, prompt section. Work it in that order — the contract test is the gate, not an afterthought.

### Task 8: The parser branch, and the concept fallback

**Files:**
- Modify: `engines/content_engine/app/services/content_engine/lesson_blocks.rb`
- Modify: `engines/content_engine/app/services/content_engine/lesson_section_parser.rb:209-230`
- Test: `engines/content_engine/test/services/content_engine/section_parser_boundaries_test.rb`

**Interfaces:**
- Consumes: `MotionScenes.known?`, `MotionScenes.validate` (Task 7).
- Produces: a section `{type: "motion", scene: String, data: Hash, narration: String, body: String}` — Task 9's partial and Task 15's controller read exactly these keys.

- [ ] **Step 1: Write the failing tests**

```ruby
    # ── `## Motion:` — a scene, or a concept, never a blank ───────────────────
    #
    # The model writes a few lines of JSON; it never writes animation code. That
    # makes a bad generation a rendering question, and the answer is fixed:
    # a default may render LESS, it may never render something FALSE.
    test "a valid motion block parses to a scene with its data and narration" do
      body = <<~MARKDOWN
        {"narration": "Mira el sujeto.",
         "data": {"tokens": ["Ele","tenho","café","."], "subject": 0, "verb": 1,
                  "wrong": "tenho", "correct": "tem", "why": "Tercera persona.",
                  "labels": {"subject": "SUJETO", "verb": "VERBO"}}}
      MARKDOWN
      section = parse_one_of("## Motion: agreement", body, "motion")

      assert_equal "agreement", section[:scene]
      assert_equal "Mira el sujeto.", section[:narration]
      assert_equal %w[Ele tenho café .], section[:data]["tokens"]
    end

    test "an unknown scene name renders the narration as a concept" do
      body = '{"narration": "Mira el sujeto.", "data": {}}'
      sections = LessonSectionParser.call(document("## Motion: nosuchscene", body))
      motion = sections.find { |s| s[:type] == "motion" }
      concept = sections.find { |s| s[:type] == "concept" && s[:body].to_s.include?("Mira el sujeto.") }

      assert_nil motion, "an unknown scene must not reach the student as a motion block"
      assert concept, "the narration is the content; it must survive as a concept"
    end

    test "data that fails the scene schema renders the narration as a concept" do
      body = '{"narration": "Mira el sujeto.", "data": {"tokens": ["Ele"], "subject": 9}}'
      sections = LessonSectionParser.call(document("## Motion: agreement", body))

      assert_nil sections.find { |s| s[:type] == "motion" }
      assert sections.any? { |s| s[:type] == "concept" && s[:body].to_s.include?("Mira el sujeto.") }
    end

    test "malformed JSON renders as a concept and is never blank" do
      sections = LessonSectionParser.call(document("## Motion: agreement", "{not json"))

      assert_nil sections.find { |s| s[:type] == "motion" }
      assert sections.any? { |s| s[:type] == "concept" },
        "a blank block is the one outcome that is worse than rendering less"
    end
```

- [ ] **Step 2: Run and watch them fail**

Run: `bin/rails test engines/content_engine/test/services/content_engine/section_parser_boundaries_test.rb`
Expected: 4 failures — `## Motion:` is not a known heading, so it falls through to `concept` with the raw JSON as its body.

- [ ] **Step 3: Add the `BLOCKS` entry**

```ruby
      "motion" => {
        fence: nil, headings: %w[Motion], partial: "motion", chrome: nil
      },
```

- [ ] **Step 4: Add the parser branch**

Beside `when :visual` in the `case section_type` at `:211`:

```ruby
          when :motion
            sections << parse_heading_motion(title, body)
```

and the method:

```ruby
    # `## Motion: <scene>` with a JSON body. The heading's title IS the scene
    # name, from the closed vocabulary the schema files define.
    #
    # Ruby owns `narration`; the scene's schema owns `data`. Anything the schema
    # refuses — a bad index, a missing key, an unknown scene, unparseable JSON —
    # becomes a CONCEPT carrying the narration text, and says why in the log, the
    # way a dropped ::: block does. A default may render less; it may never
    # render something false.
    def parse_heading_motion(scene_from_heading, body)
      scene = scene_from_heading.to_s.strip
      payload = JSON.parse(strip_json_fence(body)) rescue nil
      narration = payload.is_a?(Hash) ? payload["narration"].to_s.strip : ""

      reason =
        if payload.nil?             then "body is not JSON"
        elsif narration.blank?      then "no narration"
        elsif !MotionScenes.known?(scene) then "unknown scene #{scene.inspect}"
        else
          errors = MotionScenes.validate(scene, payload["data"])
          errors.any? ? "invalid data: #{errors.join('; ')}" : nil
        end

      if reason
        Rails.logger.warn("[LessonSectionParser] motion block fell back to concept — #{reason}")
        return { type: "concept", title: nil, body: narration.presence || body.to_s.strip }
      end

      { type: "motion", scene: scene, data: payload["data"],
        narration: narration, body: body.to_s.strip }
    end
```

`strip_json_fence` tolerates the model wrapping its JSON in a fence — the brief's own example shows one, so the parser must accept both forms:

```ruby
    # The prompt shows a fenced example, so the model emits one about as often as
    # not. Accept both rather than making the student's lesson depend on it.
    def strip_json_fence(body)
      body.to_s.strip.sub(/\A```(?:json)?\s*\n/, "").sub(/\n```\s*\z/, "")
    end
```

- [ ] **Step 5: Run the tests**

Run: `bin/rails test engines/content_engine/test/services/content_engine/section_parser_boundaries_test.rb`
Expected: PASS.

- [ ] **Step 6: Break the fallback and watch the right test go red**

Make `parse_heading_motion` return the motion section unconditionally (ignore `reason`). Confirm **`data that fails the scene schema renders the narration as a concept`** goes red specifically. Restore. This is the WP-33 lesson: a guard test that has never been observed red may be passing for an unrelated reason.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(parser): ## Motion: parses to a scene, or degrades to a concept

Validated against the scene's own schema on the Ruby side, so a bad generation
never reaches a student as a broken canvas. Verified by disabling the fallback
and watching the schema test go red."
```

### Task 9: Partial, Stimulus controller, and the contract test green

**Files:**
- Create: `engines/learning_routes_engine/app/views/learning_routes_engine/steps/lesson_sections/_motion.html.erb`
- Create: `app/javascript/controllers/motion_scene_controller.js`
- Test: `test/services/content_engine/lesson_block_contract_test.rb` (existing)

**Interfaces:**
- Consumes: the section keys from Task 8; `pin "mc"` from Task 5.
- Produces: DOM contract `data-controller="motion-scene"` with `data-motion-scene-{scene,data,narration,step-id,section-index}-value`, and `data-motion-active-token` written by the controller (read by Task 18).

- [ ] **Step 1: Run the contract test and read the failures**

Run: `bin/rails test test/services/content_engine/lesson_block_contract_test.rb`
Expected: FAIL on `every declared type has a partial on disk` — that is the checklist doing its job after Task 8 added the `BLOCKS` entry.

- [ ] **Step 2: Write the partial**

```erb
<%# A motion block is a canvas the student presses play on. Everything it needs
    is a data value; the controller lazy-loads mc.js only when the block exists,
    so a lesson without one never fetches the bundle.

    The narration text is rendered ALWAYS, not only on failure: it is the content,
    and the two failure states (guard refusal, mc.js unavailable) are then a
    missing canvas rather than an empty block. WP-35's rule — failure is visible
    and local. %>
<div class="lesson-motion"
     data-controller="motion-scene"
     data-motion-scene-scene-value="<%= section[:scene] %>"
     data-motion-scene-data-value="<%= section[:data].to_json %>"
     data-motion-scene-narration-value="<%= section[:narration] %>"
     data-motion-scene-step-id-value="<%= step.id %>"
     data-motion-scene-section-index-value="<%= index %>">
  <div class="lesson-motion__stage" data-motion-scene-target="stage"></div>
  <button type="button" class="lesson-btn lesson-btn--primary"
          data-motion-scene-target="play" data-action="motion-scene#play">
    <%= t("learning_engine.blocks.motion.play") %>
  </button>
  <div class="lesson-content lesson-motion__narration">
    <%= ContentEngine::MarkdownRenderer.render(section[:narration].to_s) %>
  </div>
  <p class="lesson-motion__note" data-motion-scene-target="note" hidden></p>
</div>
```

Add `learning_engine.blocks.motion.play` and `learning_engine.blocks.default_title.motion` to **both** `en.yml` and `es.yml` — the contract test in `block_titles_have_no_language_test.rb` asserts every declared type has a default title in both locales.

- [ ] **Step 3: Write the controller skeleton**

Values, targets, and a `play()` that lazy-imports and mounts. Sync, reduced motion and the failure states are Task 16 — this task only needs the contract test green and a scene that draws.

```js
import { Controller } from "@hotwired/stimulus"

// Lazy, the way mermaid_diagram_controller.js:13 lazy-imports Mermaid: mc.js is
// ~186 KB and most lessons have no scene.
let mcModule = null

export default class extends Controller {
  static targets = ["stage", "play", "note"]
  static values = { scene: String, data: Object, narration: String, stepId: String, sectionIndex: Number }

  async play() {
    const mc = await this._loadRuntime()
    if (!mc) return this._degrade("runtime")   // _degrade is written in Task 16 Step 5;
                                               // until then it may be a console.error stub
    this._handle = mc.mount(this.stageTarget, this.sceneValue, {
      data: this.dataValue,
      words: null,
      onToken: (i) => this._reportToken(i)
    })
    this._handle.play()
  }

  // The only thing a test can read off a canvas.
  _reportToken(i) {
    if (i === null || i === undefined) this.element.removeAttribute("data-motion-active-token")
    else this.element.setAttribute("data-motion-active-token", String(i))
  }

  async _loadRuntime() {
    try { mcModule ??= (await import("mc")) && window.mc; return window.mc }
    catch (e) { console.error("[motion-scene] runtime failed to load", e); return null }
  }
}
```

- [ ] **Step 4: Run the contract test**

Run: `bin/rails test test/services/content_engine/lesson_block_contract_test.rb`
Expected: **PASS.** If `every data-action in every partial resolves to a real controller method` fails, the partial names an action the controller does not define — add the method rather than removing the action.

- [ ] **Step 5: Assert the bundle is actually lazy**

The spec carries this as a risk and it needs a test, not an intention: the whole
reason `mc.js` is lazy-imported is that most lessons have no scene, and an
`import` that quietly moved to the top of the file would ship ~186 KB to every
lesson with nothing failing.

Add to `test/system/motion_scene_test.rb` (created in Task 18; if that file does
not exist yet, write this test first and let it be the file's first case):

```ruby
  test "a lesson with no motion block never fetches the runtime" do
    visit_lesson_without_motion

    assert_selector ".lesson-sections-container", wait: 10
    requested = page.evaluate_script(
      "performance.getEntriesByType('resource').map(e => e.name).filter(n => n.includes('mc'))"
    )
    assert_equal [], requested,
      "mc.js was fetched on a lesson with no scene: the import is no longer lazy"
  end
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(motion): the partial and the Stimulus controller

Five parts complete; lesson_block_contract_test is green. The narration renders
always, so a failure is a missing canvas rather than an empty block. The lazy
import is asserted, not assumed: a lesson with no scene fetches no mc.js."
```

### Task 10: The prompt section, pinned by the contract test

**Files:**
- Modify: `engines/ai_orchestrator/config/prompts/lesson_content.yml`
- Modify: `engines/ai_orchestrator/config/prompts/curriculum_design.yml` (or the pipeline option — whichever the contract test can pin)
- Test: `test/services/content_engine/lesson_block_contract_test.rb`, `test/services/content_engine/motion_scenes_test.rb`

**Interfaces:**
- Consumes: `MotionScenes.names`, `MotionScenes.validate` (Task 7).
- Produces: nothing code-facing.

- [ ] **Step 1: Write the failing test — the fourth copy of the schema**

The prompt's example is the fourth consumer of a scene's shape, and the one nobody would otherwise check.

```ruby
  test "the ## Motion: example in the prompt validates against the schema its heading names" do
    prompt = YAML.load_file(Rails.root.join("engines/ai_orchestrator/config/prompts/lesson_content.yml"))
    body = prompt.to_s

    example = body[/## Motion:\s*(\w+)\s*\n(\{.*?\n\})/m]
    assert example, "the prompt has no ## Motion: example, so the model has nothing to imitate"
    scene = Regexp.last_match(1)
    payload = JSON.parse(Regexp.last_match(2))

    assert ContentEngine::MotionScenes.known?(scene), "the example names an unknown scene: #{scene}"
    assert_equal [], ContentEngine::MotionScenes.validate(scene, payload["data"]),
      "the prompt teaches the model a shape the parser will reject"
    assert payload["narration"].present?, "the example must show narration"
  end

  # The languages are the whole point of the example: the model imitates it.
  test "the prompt's motion example puts the target language in tokens and the student's in narration" do
    body = YAML.load_file(Rails.root.join("engines/ai_orchestrator/config/prompts/lesson_content.yml")).to_s
    payload = JSON.parse(body[/## Motion:\s*\w+\s*\n(\{.*?\n\})/m, 1])

    assert_includes payload["data"]["tokens"], "tenho",
      "tokens must be the TARGET language (pt); an English token here teaches the model to invert them"
    assert_match(/sujeto|persona/i, payload["narration"],
      "narration must be the STUDENT's language (es)")
  end
```

- [ ] **Step 2: Run and watch it fail**

Run: `bin/rails test test/services/content_engine/lesson_block_contract_test.rb`
Expected: FAIL — `the prompt has no ## Motion: example`.

- [ ] **Step 3: Write the prompt section**

Add beside `## Visual:` in `lesson_content.yml`, using the spec's example verbatim (target language in `tokens`, student's language in `narration`, `labels` in `data`), plus the narration rule: **one to three sentences, in the route's locale, naming the thing the scene shows.** List the two scene names and both JSON shapes.

- [ ] **Step 4: Place it in the cycle without hardcoding it in the parser**

Module 1 carries one, at most two motion blocks; other modules none until Task 8 of the roadmap. Put that in `curriculum_design.yml` (or a pipeline option) and pin it with whichever assertion the contract test can actually make. **Do not put it in the parser** — the parser must accept a motion block wherever it appears.

- [ ] **Step 5: Run both suites**

Run: `bin/rails test test/services/content_engine/lesson_block_contract_test.rb`
Then: `bin/rails test test/services/content_engine/motion_scenes_test.rb`
Expected: PASS. The existing assertions `every ## heading the prompt requests maps to a known type` and `every declared type has a partial` now cover `Motion` automatically.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(prompt): teach ## Motion:, with the languages the right way round

tokens are the target language, narration the student's. The example is the
fourth copy of a scene's shape and now validates against the schema its heading
names, so the prompt cannot teach a shape the parser rejects."
```

### Task 11: No literal displayed string in a `.tsx`

**Files:**
- Create: `test/services/content_engine/motion_scene_chrome_test.rb`

**Interfaces:**
- Consumes: the scene files from Task 4.
- Produces: nothing.

- [ ] **Step 1: Write the test**

```ruby
require "test_helper"

# THE CLASS: a language is baked into a scene every route renders.
#
# The 4 September demo hardcoded 'SUJETO' and 'VERBO' in agreement.tsx — a
# Spanish lesson compiled into the artifact, wrong for a Portuguese-for-English
# route and invisible until someone read the TypeScript. Displayed strings reach
# a scene through `data` (as transform's `tag` already does) or an i18n bag at
# mount. Never a literal.
class MotionSceneChromeTest < ActiveSupport::TestCase
  SCENES = Rails.root.glob("app/motion/src/scenes/*.tsx")

  # The rule flags any quoted string of two or more characters. These are the
  # ones that are legal, measured against the demo scene — adding to this list is
  # a change to the contract and needs a reason in the commit, not a quiet append.
  HEX          = /\A#?\h{2,8}\z/                      # '#1C1812' and the '1E'/'22' alpha fragments
  MODULE_SPEC  = %r{\A[@\w./-]+\z}                    # '@motion-canvas/2d', './agreement.schema.json'
  FONT_STACK   = /\A[A-Za-z0-9 ,'-]*(?:sans-serif|monospace|system-ui)\z/
  LAYOUT_ENUM  = %w[row column center start end stretch baseline row-reverse column-reverse].freeze
  SCENE_NAMES  = %w[agreement transform words onToken].freeze

  def allowed?(literal)
    literal.match?(HEX) || literal.match?(MODULE_SPEC) || literal.match?(FONT_STACK) ||
      LAYOUT_ENUM.include?(literal) || SCENE_NAMES.include?(literal)
  end

  # Comments are stripped first: the demo says `reads as "in product"` and
  # `the "no"` in prose ABOUT the code, and flagging those would make the test
  # noise that gets disabled.
  def code_of(path)
    File.read(path).gsub(%r{/\*.*?\*/}m, "").gsub(%r{//[^\n]*}, "")
  end

  SCENES.each do |path|
    test "#{File.basename(path)} contains no displayed literal" do
      offenders = code_of(path).scan(/'([^']{2,})'|"([^"]{2,})"/).flatten.compact.uniq.reject { |s| allowed?(s) }

      assert_equal [], offenders.sort,
        "these are displayed strings compiled into the scene. Move them into the " \
        "scene's schema as data (see data.labels) so the generator writes them in " \
        "the route's languages."
    end
  end

  test "the sweep is looking at the scenes it thinks it is" do
    assert_operator SCENES.size, :>=, 2, "the scene glob stopped matching app/motion/src/scenes"
  end
end
```

- [ ] **Step 2: Run it**

Run: `bin/rails test test/services/content_engine/motion_scene_chrome_test.rb`
Expected: PASS if Task 4 step 4 removed the literals. If it fails on a *legitimate* string the allowlist misses, extend the allowlist **and say why in the commit**; if it fails on a displayed string, move that string into the schema.

- [ ] **Step 3: Prove it can fail**

Re-add `'SUJETO'` to `agreement.tsx`, confirm that scene's test goes red, remove it.

- [ ] **Step 4: Commit**

```bash
git add test/services/content_engine/motion_scene_chrome_test.rb
git commit -m "test(motion): a displayed literal in a .tsx is a test failure

Comments stripped first and an explicit allowlist for colours, module
specifiers, font stacks and layout enums, so the rule is enforceable rather than
noise someone disables."
```

---

## Tasks 12–15 — Brief §3: narration with word times

### Task 12: `timestamps:` on the one client

**Files:**
- Modify: `engines/ai_orchestrator/app/services/ai_orchestrator/ai_client.rb:89-139`
- Create: `test/services/ai_orchestrator/elevenlabs_timestamps_test.rb`

**Interfaces:**
- Consumes: `SpendGuard.call` (unchanged, still at `:27`).
- Produces: with `params[:timestamps] == true`, `request_elevenlabs` returns the existing hash plus `alignment:` (raw) and `words:` — an array of `{"text" =>, "start" =>, "end" =>}`. Tasks 13 and 16 consume `words:` in exactly that shape, and `cues.ts` (Task 4) expects those three keys.

- [ ] **Step 1: Write the failing test (no network)**

```ruby
require "test_helper"

# ElevenLabs' /with-timestamps returns JSON — audio_base64 plus a CHARACTER
# alignment — where the plain endpoint returns audio/mpeg bytes. Words are
# derived here, once, so nothing downstream re-implements the run-of-non-space
# rule differently.
class ElevenlabsTimestampsTest < ActiveSupport::TestCase
  ALIGNMENT = {
    "characters"                    => %w[H o l a   q u é],
    "character_start_times_seconds" => [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
    "character_end_times_seconds"   => [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.9]
  }.freeze

  test "a word is a run of non-space characters, timed first-start to last-end" do
    words = AiOrchestrator::AiClient.words_from_alignment(ALIGNMENT)

    assert_equal %w[Hola qué], words.map { |w| w["text"] }
    assert_in_delta 0.0, words[0]["start"], 0.001
    assert_in_delta 0.4, words[0]["end"], 0.001
    assert_in_delta 0.5, words[1]["start"], 0.001
    assert_in_delta 0.9, words[1]["end"], 0.001
  end

  test "alignment with no characters yields no words rather than raising" do
    assert_equal [], AiOrchestrator::AiClient.words_from_alignment({})
  end

  test "a non-Latin script is not special-cased" do
    a = {"characters" => %w[日 本 語], "character_start_times_seconds" => [0.0, 0.1, 0.2],
         "character_end_times_seconds" => [0.1, 0.2, 0.3]}
    assert_equal ["日本語"], AiOrchestrator::AiClient.words_from_alignment(a).map { |w| w["text"] }
  end
end
```

- [ ] **Step 2: Run and watch it fail**

Expected: `NoMethodError: undefined method 'words_from_alignment'`.

- [ ] **Step 3: Implement**

Add `self.words_from_alignment(alignment)` (pure, hence directly testable) and, in `request_elevenlabs`, when `merged[:timestamps]`: swap the URI to `.../with-timestamps`, send `Accept: application/json`, `JSON.parse` the body, `Base64.decode64(payload["audio_base64"])` into `content:`, and add `alignment:` and `words:`.

**Cost, and the one thing this plan cannot settle offline:** keep `billed_characters: Integer(response["character-cost"], exception: false)`. Whether that header exists on `/with-timestamps` is a fact about the provider. Add:

```ruby
      if merged[:timestamps] && response["character-cost"].nil?
        # The ledger must never show $0.00 for a paid call. openai_chat already
        # does that and it is roadmap debt; this must not become the second case.
        Rails.logger.warn("[AiClient] /with-timestamps returned no character-cost header; billing text.length=#{text.length}")
      end
```
with `billed_characters` falling back to `text.length`. **Task 19 observes which happened and the handoff states it.**

- [ ] **Step 4: Run the test, then the guard check**

Run: `bin/rails test test/services/ai_orchestrator/elevenlabs_timestamps_test.rb`
Expected: PASS (3 runs). Then confirm `SpendGuard.call` at `:27` still runs before **both** endpoints — comment it out and watch an existing `ai_client` guard test go red.

- [ ] **Step 5: Commit**

### Task 13: The generator stores the words

**Files:**
- Modify: `engines/content_engine/app/services/content_engine/section_audio_generator.rb`
- Test: `test/jobs/content_engine/step_metadata_write_isolation_test.rb`

**Interfaces:**
- Consumes: `words:` from Task 12.
- Produces: `audio_sections[index]["words"]` — the array Task 15 serves and Task 16 passes to `mc.mount`.

- [ ] **Step 1: Write the failing isolation test** (the WP-19 harness already in this file)

```ruby
  # A words array is written while ANOTHER section's audio lands. Both survive,
  # or a narration the student paid for is erased by an unrelated write.
  test "writing words for one section does not erase another section's audio" do
    @step.merge_metadata!("audio_sections" => {"1" => {"status" => "ready", "url" => "/a/1.mp3"}})

    gen = ContentEngine::SectionAudioGenerator.new(@step.id, 0, "Mira el sujeto.", locale: "es")
    gen.send(:update_step_audio_status!, "ready", "/a/0.mp3", 2.5, words: [{"text" => "Mira", "start" => 0.0, "end" => 0.3}])

    sections = @step.reload.metadata["audio_sections"]
    assert_equal "/a/1.mp3", sections["1"]["url"], "the sibling entry was erased"
    assert_equal "Mira", sections["0"]["words"].first["text"]
    assert_nil sections["1"]["words"], "words must not leak into a section that has none"
  end

  # parsed_sections belongs to the parser. SectionEnrichment::KEYS is the list of
  # exceptions and it does not grow for this.
  test "words are never written into parsed_sections" do
    assert_not_includes ContentEngine::SectionEnrichment::KEYS, "words"
  end
```

- [ ] **Step 2: Run, watch it fail** (`update_step_audio_status!` takes no `words:`).

- [ ] **Step 3: Implement** — add `timestamps:` to `generate!`, pass `timestamps: true` through `client.chat`, and extend `update_step_audio_status!` with `words: nil`, writing `entry["words"] = words if words.present?` **inside the existing `with_lock`**, still via `merge_metadata!`. Cache the words alongside `audio_url`/`duration`.

- [ ] **Step 4: Run** the file. Expected PASS. Then break it — move the write outside `with_lock` — and confirm the isolation test goes red.

- [ ] **Step 5: Commit**

### Task 14: `narration_prefetch_types`, and the gates stay shut

**Files:**
- Modify: `engines/content_engine/app/jobs/content_engine/media_prefetch_job.rb:96`
- Create: `test/jobs/content_engine/narration_prefetch_types_test.rb`

**Interfaces:**
- Consumes: nothing.
- Produces: `MediaPrefetchJob.narration_prefetch_types(access_state) -> Array<String>`.

- [ ] **Step 1: Write the failing test**

```ruby
require "test_helper"

# WP-20 §C: preview modules generate narration on demand; purchased modules
# pre-generate. Both gates stay shut in WP-36 — MediaPrefetchJob:24 and
# ContentPipelineJob:24 both `return unless preview_access?`, so a purchased step
# generates nothing at all until Task 8 of the roadmap. The purchased branch here
# is therefore DORMANT BY DESIGN and this is its test: it is the thing that makes
# a dormant branch honest rather than dead code nobody can evaluate.
class NarrationPrefetchTypesTest < ActiveSupport::TestCase
  test "a preview module pre-generates concept and summary, never motion" do
    types = ContentEngine::MediaPrefetchJob.narration_prefetch_types(:preview)

    assert_equal %w[concept summary], types.sort
    assert_not_includes types, "motion",
      "a preview module must not pre-generate narration for a scene the student may never open"
  end

  test "a purchased module pre-generates motion too" do
    assert_includes ContentEngine::MediaPrefetchJob.narration_prefetch_types(:purchased), "motion"
  end

  test "an unknown access state pre-generates nothing" do
    assert_equal [], ContentEngine::MediaPrefetchJob.narration_prefetch_types(:locked)
  end
end
```

- [ ] **Step 2: Run, watch it fail.**

- [ ] **Step 3: Implement** — replace the literal `%w[concept summary]` at `:96` with `self.class.narration_prefetch_types(access_state)`, where `access_state` comes from the step's module (`RouteModule` declares `enum :access_state, {preview: 0, locked: 1, purchased: 2}`); `RouteStep#preview_access?` at `route_step.rb:179` shows the lookup. Add a private reader rather than a new model method:

```ruby
    def access_state
      @access_state ||= LearningRoutesEngine::RouteModule
                          .where(id: @step.route_module_id).pick(:access_state) || "locked"
    end
```

and:

```ruby
    # Dormant by design. MediaPrefetchJob:24 returns unless preview_access?, so
    # the :purchased branch cannot be reached today: purchased modules generate
    # nothing until Task 8 wires paid-module generation. It is written and tested
    # now so that Task 8 is a gate change and not a spend decision made in a hurry.
    def self.narration_prefetch_types(access_state)
      case access_state.to_sym
      when :preview   then %w[concept summary]
      when :purchased then %w[concept summary motion]
      else []
      end
    end
```

- [ ] **Step 4: Run** the new file and `bin/rails test engines/content_engine/test`. Expected PASS, with no change to what a preview step actually enqueues.

- [ ] **Step 5: Commit** — message states plainly that the purchased branch is unreachable until Task 8.

### Task 15: The audio endpoints serve motion

**Files:**
- Modify: `engines/content_engine/app/controllers/content_engine/section_audio_controller.rb:12,44`
- Create: `test/controllers/content_engine/motion_narration_test.rb`

**Interfaces:**
- Consumes: Task 13's storage.
- Produces: `GET status` → `{status:, url:, duration:, words: [...]}`, `words` present only when stored.

- [ ] **Step 1: Write the failing request test** — generate for a motion section, then assert `status` carries `words`; and that a section with no stored words omits the key rather than sending `null`.

- [ ] **Step 2: Run, watch it fail.**

- [ ] **Step 3: Implement** — `generate` passes `timestamps: true` when the section at `section_index` is type `motion`; `status` includes `words` when present. Reuse `update_audio_section_status!` at `:112` unchanged.

- [ ] **Step 4: Run.** **Step 5: Commit.**

---

## Tasks 16–18 — Brief §4: the voice leads, and proving it

### Task 16: Cues in the scene, sync in the controller

**Files:**
- Modify: `app/motion/src/scenes/{agreement,transform}.tsx`, `app/motion/src/main.ts`
- Modify: `app/javascript/controllers/motion_scene_controller.js`

**Interfaces:**
- Consumes: `cueFor`/`remainingUntil` (Task 4), `words` from Task 15.
- Produces: `data-motion-active-token` on the mount element; `handle.cueStats()`.

- [ ] **Step 1: Confirm the seek API on the pinned version — do not guess**

Run: `grep -rn "requestSeek\|seek(" app/motion/node_modules/@motion-canvas/core/lib/app/Player.d.ts | head`
Record which of `player.requestSeek` / `playback.seek(frame)` exists in 3.17.2 and use that one. The spec deliberately left this to be read rather than assumed.

- [ ] **Step 2: Make the scenes wait on cues**

In `agreement.tsx`, the beats that name a word (subject, verb, the corrected word) wait on their cue; the beats that name nothing (the plop-in, the camera pull-back) keep their durations:

```tsx
  const words = useScene().variables.get<Word[] | null>('words', null)();
  const report = useScene().variables.get<((i: number | null) => void) | null>('onToken', null)();
  let cursor = 0;

  function* beatFor(tokenIndex: number, fallback: number) {
    const t = cueFor(d.tokens[tokenIndex], words, cursor);
    if (t === null) { yield* waitFor(fallback); }
    else { cursor += 1; yield* waitFor(remainingUntil(t, useScene().playback.time)); }
    report?.(tokenIndex);
  }
```

- [ ] **Step 3: Sync in the controller**

Start audio and player together; on `timeupdate` compare `audio.currentTime` with the player's time and seek when drift > 120 ms; pause pauses both; `ended` shows the final frame; replay resets both. Log the drift maximum and `cueStats()` to the console — Task 19 reads both.

- [ ] **Step 4: Reduced motion** — `window.matchMedia("(prefers-reduced-motion: reduce)")`, as `route_journey_controller.js:64` does: render the final frame from the start, audio still plays.

- [ ] **Step 5: The two failure states** — guard refusal → `spend_guard.*` sentence in the note target, scene plays on fixed timings; `mc.js` unavailable → narration plus an audio-only play button. **Never a blank block, never an English literal.**

- [ ] **Step 6: Rebuild and commit** — `bin/motion-build` (the hash test fails otherwise), then commit both outputs.

### Task 17: The fixture, with no paid call

**Files:**
- Create: `test/fixtures/files/motion_narration.mp3`, `test/fixtures/files/motion_narration_words.json`

- [ ] **Step 1: Generate the fixture once, by hand, from a console** — one paid call, outside the suite, recorded in the handoff's cost line. The narration must include a **CJK token** (the language-neutral requirement) and a word starting at **1.2 s** (test 3's assertion).

- [ ] **Step 2: Commit them** with a README line in the test explaining they exist so the suite makes no paid call, and that regenerating them costs money.

### Task 18: The system test

**Files:**
- Create: `test/system/motion_scene_test.rb`
- Modify: `test/application_system_test_case.rb` **only if** the browser refuses autoplay

- [ ] **Step 1: Write the test**

Build a step whose `parsed_sections` has a motion block and whose `audio_sections["N"]` carries the fixture URL and words. Then:

```ruby
  test "the token the narration says at 1.2s lights up after 1.2s and not before" do
    visit_lesson_with_motion
    find("[data-motion-scene-target='play']").click

    assert_selector ".lesson-motion canvas", visible: true, wait: 8
    assert page.evaluate_script("document.querySelector('.lesson-motion audio')?.paused === false"),
      "the audio never started; if headless Chrome refused autoplay, add " \
      "--autoplay-policy=no-user-gesture-required to the driver options and say so in the handoff"

    # Sampled either side of the cue. A canvas exposes nothing else a test can read,
    # which is why the scene reports its active token through onToken.
    before = page.evaluate_script("document.querySelector('.lesson-motion').dataset.motionActiveToken")
    assert_not_equal "1", before, "the token lit before the voice said it"

    assert_selector ".lesson-motion[data-motion-active-token='1']", wait: 5
  end

  test "a non-Latin token renders a real glyph, not a missing-glyph box" do
    visit_lesson_with_motion
    widths = page.evaluate_script(<<~JS)
      (() => {
        const c = document.createElement('canvas').getContext('2d');
        c.font = "84px 'DM Sans','Hiragino Sans GB','PingFang SC','Microsoft YaHei','Noto Sans CJK SC',system-ui,sans-serif";
        return {token: c.measureText('日本語').width, notdef: c.measureText('\\uFFFF').width};
      })()
    JS
    assert_not_in_delta widths["token"], widths["notdef"] * 3, 0.5,
      "the CJK token measured at the notdef width, so it rendered as tofu. " \
      "Font stack in use is in the script above; install a CJK face or change the stack."
  end
```

- [ ] **Step 2: Run it.** If audio never starts, add `options.add_argument("--autoplay-policy=no-user-gesture-required")` to the existing driver-options block in `test/application_system_test_case.rb` — which already carries comments explaining each browser workaround — and **say in the handoff that the test needed it.**

- [ ] **Step 3: Prove it can fail** — make the scene report `onToken` immediately for every token; confirm the "not before" assertion goes red. Restore.

- [ ] **Step 4: Commit.**

---

## Task 19 — The production path, and only then a ✅

**Files:** none. This is evidence, not code.

- [ ] **Step 1: Generate one real lesson in development** with the prompt change. **One paid call.** Record its exact cost from the ledger, and whether `/with-timestamps` returned a `character-cost` header (Task 12).
- [ ] **Step 2: Render it end to end in a browser** — word lighting on the voice; drift under 120 ms across a 20 s narration (logged); reduced motion showing the final frame; both failure states reading as a sentence in the student's language.
- [ ] **Step 3: Measure first-play latency on a preview step** — WP-20 §C asked for this and it has never been measured.
- [ ] **Step 4: Record the cue fallback rate** from `cueStats()` on that real narration.
- [ ] **Step 5: Verification** — the three suites, three runs each, from a clean base, one suite at a time, as `WP33_HANDOFF.md` tabulates them (the four known engine failures and nothing else); `bundle exec rubocop` clean.
- [ ] **Step 6: `requesting-code-review`** — a subagent review of the whole diff against `PROMPT_27_WP36_NARRATED_SCENES.md`; its findings go in the handoff, fixed or argued.
- [ ] **Step 7: Write `WP36_HANDOFF.md`** — what changed; the red-then-green of every new test; spec and plan paths; measured first-play latency; the cost of the one generated lesson; the cue fallback rate; and what was not done.

---

## Notes for the executor

- **Nothing is ✅ because a piece works in isolation.** A step is done when the production path calls it.
- **Do not push.** The owner pushes.
- Tasks 1–3 are independently shippable and worth merging even if the rest stalls.
- Task 16 depends on a fact (`requestSeek` vs `seek`) that must be **read from the pinned library**, not assumed.
- Any red you did not predict → `superpowers:systematic-debugging`. No "flaky", no retry-until-green.
