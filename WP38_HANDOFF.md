# WP-38 — Video lessons from the studio

A `video` lesson block, and a token-authenticated `/admin/api/` door so the Manim Studio can publish
a rendered mp4 and an `.srt` into a step of a route, and take one back out.

Branch `wp38-video-lessons`, **34 commits** over `39f7fa24` (30, plus 4 from Task 10). Not pushed,
not merged.

> **Read §7 before you merge.** `main` has advanced to `9c9e19e4` and that now **includes WP-36**, so
> WP-38 is the package landing second — and the file where the two collide **merges cleanly while
> producing two definitions of the same two methods**. This branch is 19 behind `main` and 34 ahead;
> rebase or merge onto `main` at `9c9e19e4` first. `ci-engine-tests` (3 commits) merges before this
> branch.

---

## 1. What you run

Nothing in this package works until these two commands have been run. The API answers **401 to
everything** while `studio.api_token` is unset — deliberately, and there is a test that fails if that
ever stops being true.

```
EDITOR="nano" bin/rails credentials:edit                       # studio: api_token: <48 chars>
EDITOR="nano" bin/rails credentials:edit --environment production
```

Both files take the same shape:

```yaml
studio:
  api_token: <the token>
```

Then the same token into `experiments/manim_voiceover_poc/.env` (mode 600, git-ignored) as
`LR_STUDIO_TOKEN`, with `LR_BASE_URL=http://localhost:3000`. Then commit both `.enc` files and
deploy.

I never had your token and never wrote to your credential files. For the checks in §2 I generated a
throwaway token of my own, wrote `config/credentials/development.{key,yml.enc}`, and deleted both.
Neither file is on disk and neither ever entered a commit:

```
$ git log --all --diff-filter=A --name-only --pretty=format: -- config/credentials
config/credentials/production.yml.enc        # yours, added in 91e9bfed
$ ls config/credentials/
production.key  production.yml.enc
```

---

## 2. The curl checks, and their real output

Against a dev server on 127.0.0.1:3009, with my own token set, on a real step
(`6674813f`, "WP-36 motion demo", 4 sections, 0 attempts). Fixtures were real, not the test
doubles: ffmpeg produced a 22,325-byte H.264 mp4, and the subtitle was accented CRLF Spanish
("Buenos días, ¿qué tal?").

```
 1  GET  /admin/api/routes    no token      -> 401
 2  GET  /admin/api/routes    wrong token   -> 401
 3  GET  /admin/api/routes    real token    -> 200
       cache-control: private, no-store
       x-robots-tag: noindex, nofollow
       route keys [id level modules title]
       step keys  [description estimated_minutes has_video id position title video]
       "parsed_sections" appears nowhere in the body

 4  POST video = a PNG renamed .mp4         -> 422 {"error":"the bytes are not an mp4"}
 5  POST real mp4 + accented CRLF srt       -> 201 placement "prepend", section_index 0
 6  GET the returned video_url,                 [SUPERSEDED BY F1 — see below]
       Range: bytes=0-99                    -> 206, content-range bytes 0-99/22325
                                                  accept-ranges: bytes
 7  POST the IDENTICAL bytes again          -> 200 placement "replace", index 0
 8  POST DIFFERENT bytes                    -> 201 placement "replace", index 0, duration now 3
 9  record an attempt, then DELETE          -> 409
       {"error":"students have recorded work on this step; re-upload replaces the video,
                 unpublish would re-point their attempts"}
       the attachment survived; parsed_sections byte-identical to the frozen copy
10  remove the attempt, then DELETE         -> 204
       sections back to ["concept","motion","motion","summary"]
       no Video heading left in the body, both attachments gone
11  audit: 7 rows, one per AUTHENTICATED call including the 422 and the 409.
       The two 401s wrote nothing.
```

**Step 6 was run against the old URL and no longer holds as written.** It was an Active Storage
proxy path, and the reason given was Range support: a student dragging the scrubber issues a Range
request, and `send_file` does not answer one.

F1 kept the Range answer and took away the anonymity. `video_url` is now
`/learning/routes/:route_id/steps/:id/video`, served by `LearningRoutesEngine::StepMediaController`
behind the same four before_actions as `steps#show`, and it still answers 206 — it calls Active
Storage's own `send_blob_byte_range_data`. So **a bare curl with no session now gets a 302 to
`/sign_in`, not the bytes**, which is the whole point: the lesson page was entitlement-gated and the
film on it was not.

That step was **not** re-run as curl. It is covered, with stronger assertions than a curl can make,
by `test/integration/learning_routes_engine/step_media_access_test.rb`: anonymous → sign-in, a
signed-in stranger → 403, the entitled owner → 200 `inline`, and `Range: bytes=0-9` → 206 with
`Content-Range: bytes 0-9/<size>` and `Accept-Ranges: bytes`. To reproduce step 6 by hand now, send
the session cookie of a user entitled to that route.

---

## 3. Suites, RuboCop, census

Three runs each, one suite at a time, from a clean base.

| | runs | assertions | result |
|---|---|---|---|
| `bin/rails test` | 859 | 3947 | 0 failures |
| `bin/rails test engines/*/test` | 375 | 1556 | 3 failures + 1 error |
| `bin/rails test test/system/video_lesson_test.rb` | 6 | 52 | 0 failures, 1 error (see below) |

**The invocation changed, and the reason matters.** The old combined line
`bin/rails test test engines/*/test` names `test` explicitly, which makes the runner collect
`test/system` as well — Capybara boots Puma, measured. That is the `system-test` job's work and needs
a browser the `test` job does not have. `ci-engine-tests` therefore adds a **separate** CI step,
`bin/rails test engines/*/test`, and leaves the bare `bin/rails test` alone.

The engine column's four are pre-existing, not ours, and **already fixed on `ci-engine-tests`**, which
merges before this branch: `RouteGenerationJobTest#test_generates_route_and_creates_steps`,
`RouteGeneratorTest#test_route_has_level`,
`GapAnalysisJobTest#test_enqueues_reinforcement_job_when_gaps_found`,
`ReinforcementJobTest#test_generates_reinforcement_routes_for_unresolved_gaps`. Three of the four are
one defect — a bare `find` handed to a service that reads an association off the record. Under
production's `:log` that is a WARN line and the job completes; under the suite's `:raise` it raised,
and `retry_on StandardError` swallowed it into a no-op.

**The system-test error is a flake, and it is not from Task 10.** `Net::ReadTimeout` in
`sign_in_through_ui` on `test_no_subtitles_upload_means_no_<track>_at_all`; the same test passes on
its own (43s, 6 assertions). These tests fabricate their own section with Active Storage proxy URLs
(`video_lesson_test.rb:83-86`) and never reach the new `StepMediaController`, and the AS proxy
controller already included `ActionController::Live`. `bin/rails test:system` in full was **not**
re-run for Task 10.

`bundle exec rubocop`: 603 files, no offenses.

**The census.** `wp33:reparse_census` before and after, on a real 14-section dev step carrying two
paid-for `image_url`s and seven `audio_sections` entries:

```
images        2 -> 2 -> 2                                   (publish, then unpublish)
image indices 4,11 -> 5,12 -> 4,11                          (they move WITH their sections)
audio keys    0,1,3,4,7,10,11 -> 1,2,4,5,8,11,12 -> 0,1,3,4,7,10,11
intro prose survived, Video heading gone
```

---

## 4. The screenshot

`tmp/wp38-video-dark.png` — the video inside the step, dark theme: the VIDEO badge, the title, and a
decoded frame in the player. `tmp/wp38-video-light.png` is the same page in light.

Regenerate either with `SCREENSHOT=1 bin/rails test test/system/video_lesson_test.rb`. It is written
from the same page the contrast assertions measure, so the picture and the numbers cannot describe
two different renders.

---

## 5. Things the code said that the brief and the spec did not

Each of these was found by running something, and each changed the design.

**`audio_sections` is positional too, and the offset table did not cover it.** The spec's safety
argument named `parsed_sections` and `block_attempts.section_index`. It missed that
`metadata["audio_sections"]` is a Hash *keyed by the same index* — written by `media_prefetch_job.rb`
and `section_audio_controller.rb:119`, read by `section_audio_controller.rb:48`, with
`_lesson.html.erb:182` passing the loop index into every partial. A prepend moved every section down
one and left that map untouched, so every paid TTS clip played under the wrong section. Worse on a
round trip: publish-then-unpublish did not merely misfile the last clip, it **deleted** the entry
(`{"0"=>…,"2"=>…}` expected, `{"0"=>…}` actual), after which `MediaPrefetchJob` buys that narration
again. Fixed in `b9d151b8`; the census line above is the proof.

**8 of 10 real lesson bodies begin with prose before their first `##` heading.** The parser has a
whole branch for that shape. Prepending a `## Video:` heading put that paragraph inside the video's
section, where `split_aftermath` found no terminator and handed JSON and prose together to
`JSON.parse`. The block degraded to a concept whose body was raw JSON; `publish!` raised rather than
persist it, which meant **the studio got a 422 for four out of five real lessons**. The payload's own
closing brace is now the boundary (`split_json_object`, depth-counted, strings and escapes
respected).

**Then that fix made a second defect reachable, and I caused it.** Once the prose survived as the
section's `aftermath`, `unpublish!`'s strip started deleting it: `VIDEO_SECTION` runs to the next
`##`, so removing "the section" removed the author's intro. Dev step `07e88fda` came back from an
unpublish as a 13-section body under a 14-section cache — permanently incompatible with itself, and
therefore skipped forever by `wp33:reparse`. The step is repaired. Both paths now ask
`LessonSectionParser.split_json_object` where the payload ends; two answers to that question is what
caused it.

**An append was re-pointing recorded work — the mirror of the rule you widened for unpublish.** Once
the insertion index came from the parse, an appended video stopped landing at the end of the array:
the parser *synthesises* trailing sections that are not in the markdown (the summary always, plus
leftover `knowledge_checks`), so the video parsed in front of them and every index from there up
moved. `append` is the placement chosen precisely because the step *has* recorded work. It now lands
at `old.length`, and that deliberately leaves the cache and the body disagreeing about where the
video sits — unavoidably, because `old.length` is past every synthesised section, so no edit to the
markdown can put the heading there. The ranking is explicit in the code: re-pointing recorded work is
live harm; a body the cache contradicts only bites on a rebuild from an emptied cache, and it makes
the step position-incompatible so `wp33:reparse` skips rather than rewrites it.

**Three snippets I put in the brief were defective, and each was caught by being run.**

- The subtitle validator raised on this app's normal input. `sub(/\A\xEF\xBB\xBF/n, "")` is an
  ASCII-8BIT regexp, and matching one against a non-pure-ASCII UTF-8 string raises
  `Encoding::CompatibilityError` — on BOM+ASCII, on accented-with-no-BOM, on BOM+accented srt and on
  BOM+accented vtt. Only a pure-ASCII, no-BOM file survived: a 500 on essentially every Spanish
  subtitle file, including the case its own comment claimed to tolerate.
- The base controller's verbatim code would not have booted: `ActionController::API` does not mix in
  `HttpAuthentication::Token::ControllerMethods`.
- `Rails.application.credentials.config[:studio] = …` does not affect `credentials.dig` in Rails 8.1
  — `dig` reads a separately memoised `@options` tree — so the suggested test idiom silently stubbed
  nothing.

**And one prescribed mechanism was impossible.** I specified a `before_action` flag read by an
`after_action` for the audit. A `before_action` that renders halts the chain, so after_actions never
run and the 413 and the 404 left no trace. It is an `around_action` declared first; reverting it
fails the 300 MB test with `didn't change by 1, but by 0`.

**A guard's justification rested on the wrong list.** I narrowed the unpublish refusal to work
strictly *above* the video and justified excluding the video's own index with `GATING_TYPES`. That
gates progression, not row creation: `BlockAttemptsController#create` records an attempt for any
index present in `parsed_sections`, `BlockAttemptRecorder` sets `completed_at` unconditionally on its
non-gradable branch, and `RouteStep#outstanding_blocks_for` matches satisfied attempts by
`section_index` alone, ignoring `block_type`. So a submission at a video's index is a *satisfied*
attempt, and removing the video slides the next section into it carrying someone else's credit. The
condition is `>=`.

---

## 6. Known issues, and what I did not do

**A fourth index-keyed structure is not handled. This is the one to read.**
`SectionAudioGenerator` addresses each clip by index twice — the cache key
`section_audio:<step>:<index>` and the **filename** `section_<step>_<index>_<ts>.mp3`, which `cached`
globs as a fallback — and the player never uses the URL stored in `audio_sections`:
`_section_audio_player.html.erb` builds `/content/section_audio/<step>/<current index>/show`. So
after a publish that shifts indices, a section whose `audio_sections` entry was *correctly* moved
requests the old index and gets a neighbour's narration, or a 404 that regenerates a clip you already
paid for.

I did not fix it, and the reason is that both correct fixes touch shared surface and the choice is
yours: resolve `show` through `audio_sections[i]["url"]` (the stored truth, one controller, fixes the
class), or have the publisher rename the files and move the cache entries (no shared-controller
change, but filesystem mutation around a publish and a rename API `AudioStorage` does not have). I
recommend the first.

**Operationally, until it is fixed: do not publish a video to a step that already has generated
narration.** A step with no `audio_sections` entries is unaffected, and so is any step where the
video is appended without shifting anything.

**Every light-theme lesson badge fails WCAG AA, and the video badge is the best of the eight.**
Measured in the browser with the real formula against `--color-bg` #F5F1EB, worst gradient stop:

```
--visual / --tip       #D97706   2.61
--example              #059669   3.02
--check / --challenge  #8b5cf6   3.27
--concept / --audio    #6366f1   3.44
--video                #dc2626   3.70      <- this package's
```

Dark passes comfortably (video 7.52). This is a pre-existing palette problem across every lesson
block type, not a WP-38 regression, and repainting only `--video` would leave seven worse badges on
the same page. `test/system/video_lesson_test.rb` therefore **pins 3.70 as a ratchet** rather than
accommodating it: darkening the badge goes red, and so does fixing it — at which point whoever fixes
it raises the pin to 4.5 and deletes the comment. Both directions are proven by mutation. The palette
decision is yours.

**`duration_seconds` is client-supplied and never verified.** There is no ffprobe in the image and
this package did not add one. A studio that sends a wrong number produces a wrong `m:ss`, and nothing
detects it. Note it does *not* "stay visible as the wrong number" to a student:
`_video.html.erb:22` gates the caption on `to_i.positive?`, so a non-numeric value renders no caption
at all. It stays visible in the stored section and in the endpoint's response, which is where you can
compare it against the film.

**A 429 is not audited.** Rack::Attack answers in middleware, before any controller callback, so
`owner.studio_api` rows do not exist for throttled calls — Rack::Attack's own log is the record.
Auditing them would let an unauthenticated flood write rows into `owner_audit_events`, which is what
the throttle exists to prevent. Your ruling, recorded here as the boundary.

**A re-upload that omits `subtitles` clears the previous captions.** They were timed to the film being
replaced, so keeping them would show a student subtitles that do not match what they are watching and
drift further out the longer the clip runs. The response carries `subtitles_url: null` for that
section. This is the only field in the endpoint whose *omission* changes stored data — your studio
client now returns `subtitles_sent` and warns when no `.srt` sits beside the render.

**~~`SectionResolver.lesson_content_for` can pick a different AiContent row~~ — FIXED (F3).** It is
now `.order(:created_at, :id)`, oldest first, and `audio_generator.rb:58` asks that one method instead
of carrying its own `.first`. One deliberate behaviour change: on an **exercise** step the audio
generator now returns the exercise row rather than inventing a text row from `step.description` —
which is the row that step's page actually reads, so the narration and the text finally describe the
same thing.

`ContentGenerationJob:36` and `ContentPipelineJob:152` still each `create!` a row without deleting the
old, so duplicates still happen; ordering only makes the *read* deterministic.
`rake wp38:ai_content_census` counts them (read-only — which of two bodies is the real one is a
judgement about content, not a rule a task can apply).

**Seven sites answer "which AiContent row is the lesson body", and five still disagree.** With one row
per step — the normal case — all seven agree and nothing regresses. With duplicates the audio
generator now writes to the *oldest* row while three readers read the *newest*, so narration can be
generated and never played. It was already broken in an undefined way; it is now broken
deterministically, which is what makes it countable.

| site | rule today |
|---|---|
| `section_resolver.rb` `lesson_content_for` | oldest — `order(:created_at, :id)` |
| `audio_generator.rb:58` | delegates to the above |
| `route_step.rb:192` `audio_content` | **newest** — `order(created_at: :desc).first` |
| `audio_controller.rb:31` | **newest** — `order(created_at: :desc).first` |
| `voice_evaluator.rb:114` | **newest** — `order(created_at: :desc).first` |
| `audio_controller.rb:10` | unordered — `with_audio_ready.first` |
| `tutor_reply_job.rb:37` | unordered — `ai_contents&.first` |

Owner's ruling: run the census in production. **0 rows** → own package, after WP-37. **>0 rows** →
back into Task 10 before this branch merges.

**~~A 500 is not audited~~ — FIXED (F2).** `rescue StandardError` in
`StepVideosController#publish` purges what the request attached, records the fault as status 500 with
the error class name, and re-raises. The original concern stands and is why **both** of those are
guarded and the **original** error is what leaves the method: a cleanup that raises its own exception
replaces the error you need to see. That is also still why `audit_studio_access!` has no `ensure`.

---

## 7. Merging

**The order is no longer open. WP-36 has merged; `main` is `9c9e19e4`.** This branch's merge base is
still `39f7fa24`, so it is **19 behind and 34 ahead**. Rebase or merge onto `main` at `9c9e19e4`
before anything else — production runs the WP-36 line at that commit, and until this branch sits on
top of it the parser here has never been compiled against the parser there.

`ci-engine-tests` (3 commits, `a32230fa`, same base) merges **before** this branch. It is what turns
the engine column in §3 green.

### The merge hazard: it is clean where it should conflict

`git merge-tree --write-tree main wp38-video-lessons` was run. Result:

```
Auto-merging engines/content_engine/app/services/content_engine/lesson_section_parser.rb
```

**No conflict — and the merged file defines the same two methods twice:**

| method | WP-36 (from `main`) | WP-38 |
|---|---|---|
| `split_json_object` | line 525 | lines 912 (`self.`) and 914 |
| `safe_parse_json` | line 566 | line 948 |

Ruby does not warn on method redefinition, so this merges green, runs green on WP-38's own tests, and
the **later definition silently wins**. That is WP-38's. The two are **not** interchangeable:

- WP-36's returns `[nil, text]` on a miss and an **unstripped** remainder on a hit.
- WP-38's returns `[nil, text.strip.presence]` and a **stripped, `.presence`** remainder — so an
  empty aftermath becomes `nil` rather than `""`.

So a clean merge repoints WP-36's motion parser at a contract it was not written against. **Delete one
copy by hand, keep WP-38's, and run WP-36's motion parser tests** — the merge will not force you to.
`safe_parse_json` is byte-identical; just delete one.

### The three real conflicts, all test files

```
engines/content_engine/test/services/content_engine/section_parser_boundaries_test.rb
test/services/content_engine/lesson_block_contract_test.rb
test/system/lesson_block_visibility_test.rb
```

The first is WP-36's own boundary sweep over the shared parser, which is exactly the suite that would
catch the override above. Resolve it by keeping **both** branches' cases and running the file.

`.gitignore` **no longer conflicts** — it auto-merges now. The earlier note in this section predicted
a textual conflict; that is stale.

**One thing I broke and only partly fixed.** `.gitignore:56` is `/node_modules` — root-anchored — so
the second npm tree WP-36 created at `app/motion/` was never ignored, and a `git add -A` of mine in
`2624d00e` committed **8749 files, about 88 MB**. The pattern is now unanchored, `app/motion` is
untracked, and HEAD's tree is clean of it — the whole-branch diff went from 88 MB to 264 KB. Only
`node_modules` and one `dist` artefact were caught, none of WP-36's source, so the merge promise is
intact and nothing on this branch ever referenced the directory.

The blobs are still in this branch's *history*. Purging them rewrites every commit since the merge
base, which is your call because you are the one who pushes:

```
git branch wp38-pre-purge                      # a second belt; wp38-backup-before-motion-purge exists
git filter-branch --index-filter \
  'git rm -r --cached --ignore-unmatch app/motion' -- 39f7fa24..HEAD
git diff wp38-backup-before-motion-purge HEAD  # must show ONLY app/motion deletions
bin/rails test                                 # 839 / 3883 / 0
```

If you would rather not rewrite, merging as-is is correct — the tree is right, and only the repo's
size pays.

I did **not** add `app/motion/` itself to `.gitignore`: that would silently ignore WP-36's source
when that branch merges. `/app/motion/dist/` is ignored, since it is a build artefact.

---

## 8. Roadmap — what Task 10 left open, in order

**1. WP-39 — media behind the paywall: images.** The first item, because it is the same defect the
film had until yesterday, still live. `image_generation_service.rb:158-166` creates bare
`ActiveStorage::Blob`s for generated lesson images and addresses them with
`rails_blob_url(blob, only_path: true)`; those URLs are persisted into `parsed_sections["image_url"]`.
Images of **paid** modules are therefore reachable by anyone holding the URL, permanently, with no
session — exactly what F1 closed for video.

This is why `config.active_storage.draw_routes = false`, the belt-and-braces half of F1, is **not in
this branch**: turning the routes off would 404 every image already generated, and silently degrade
new ones to base64 data URIs through the `rescue => e` at `image_generation_service.rb:170`. WP-39 is
an app-served path for image blobs **plus a data migration of the persisted `image_url`s**, and
`draw_routes = false` lands at the end of it. The residual exposure meanwhile is small but real:
nothing publishes a film's signed blob ID any more, so a video's proxy URL is now unguessable *and*
unpublished, but the route is still drawn.

**2. F5 — the `<track>` language is hardcoded.** `_video.html.erb:18` is
`srclang="es" label="Español"`, fixed, in an app whose locales this package edited. It is right today
— every lesson narrates in Spanish — and nothing records what language an uploaded `.srt` actually is,
so the day a second language ships this is wrong silently. Wants a language on the payload, not a
guess at render time.

**3. F6 — `Admin::Api::RoutesController#index` is unbounded.** Every route → every module → every
step, no pagination, no limit. Owner-only, one caller, roughly ten routes: fine today, a problem at
a hundred.

**4. F7b — the studio throttle's headerless boundary.** A request carrying no `Authorization` header
discriminates to `nil` and Rack::Attack does not throttle a nil discriminator, so a headerless flood
on `/admin/api/` is caught by the general per-IP backstop rather than by the per-token rule
(`rack_attack.rb:85-89`). One script, one token, and the boundary is written down at the throttle
itself. Lowest of the four.

**Also open, and not scoped here:** the lazy-traversal sweep (`routes_controller.rb:39,100`,
`steps_controller.rb:101`, `route_progress_tracker.rb:65`, `adaptive_difficulty.rb:115`,
`_route_card.html.erb:8`, `routes/show.html.erb:69`). Grade each on what production does under
`:log` — a WARN line and a lazy query, **not** a 500.

---

## 9. What is where

| | |
|---|---|
| `engines/content_engine/app/services/content_engine/lesson_video_publisher.rb` | the heart: body edit, offset-aware rebuild, the refusals |
| `engines/content_engine/app/services/content_engine/lesson_section_parser.rb` | `parse_heading_video`, `split_json_object` |
| `engines/learning_routes_engine/app/views/…/lesson_sections/_video.html.erb` | the partial; no Stimulus, nothing reads a controller off it |
| `app/controllers/admin/api/base_controller.rb` | token auth, audit, no-store |
| `app/controllers/admin/api/routes_controller.rb` | the tree the studio picks a step from |
| `app/controllers/admin/api/step_videos_controller.rb` | POST and DELETE, byte validation, `MAX_VIDEO_BYTES` |
| `engines/learning_routes_engine/app/controllers/…/step_media_controller.rb` | **F1** — the gated film and captions; subclasses `StepsController` |
| `config/initializers/active_storage_inline_types.rb` | **F1** — why `disposition: "inline"` was being overridden |
| `lib/tasks/wp38_ai_content_census.rake` | **F3** — counts steps carrying two bodies of the same type |
| `test/integration/learning_routes_engine/step_media_access_test.rb` | **F1** — anonymous, stranger, owner, Range 206, cache |
| `test/services/content_engine/lesson_content_selection_test.rb` | **F3** — the ordering, the one rule, the census |
| `test/system/video_lesson_test.rb` | what a student sees, including the contrast ratchet |
| `.superpowers/sdd/2026-09-16-wp38-video-lessons/progress.md` | every ruling made during execution, with its cost-if-wrong |
