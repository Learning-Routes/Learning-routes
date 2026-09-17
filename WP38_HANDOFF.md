# WP-38 — Video lessons from the studio

A `video` lesson block, and a token-authenticated `/admin/api/` door so the Manim Studio can publish
a rendered mp4 and an `.srt` into a step of a route, and take one back out.

Branch `wp38-video-lessons`, 30 commits over `39f7fa24`. Not pushed, not merged.

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
 6  GET the returned proxy video_url,
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

Step 6 is why the URL is an Active Storage **proxy** path and not `send_file`: a student dragging
the scrubber issues a Range request, and only the proxy controller answers one.

---

## 3. Suites, RuboCop, census

Three runs each, one suite at a time, from a clean base.

| | runs | assertions | result |
|---|---|---|---|
| `bin/rails test` | 839 | 3883 | 0 failures, 3× |
| `bin/rails test:system` | 76 | 578 | 0 failures, 3× |
| `bin/rails test test engines/*/test` | 1289 | 6011 | 3 failures + 1 error, 3× |

The combined column's four are pre-existing and none of them are ours. I checked them out on `main`
and they fail there identically: `RouteGenerationJobTest#test_generates_route_and_creates_steps`,
`RouteGeneratorTest#test_route_has_level`,
`GapAnalysisJobTest#test_enqueues_reinforcement_job_when_gaps_found`,
`ReinforcementJobTest#test_generates_reinforcement_routes_for_unresolved_gaps`.

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

**`SectionResolver.lesson_content_for` can pick a different AiContent row than the one that was
written.** `ContentGenerationJob:36` and `ContentPipelineJob:152` each `create!` a new row without
deleting the old, and the picker is `by_type(:text).first` over a uuid primary key with **no
`ORDER BY`**. I deliberately did not change it: it is a shared service and deciding which row wins
would change what students see on any step that has two. It is pre-existing, and it is the mechanism
behind the `:replace`-on-a-body-with-no-heading edge case noted in the publisher.

**A 500 is not audited**, because a write attempted with an exception in flight can raise and replace
the error you need to see.

---

## 7. Merging

**WP-36 and WP-38 can still merge in either order**, which was the promise. Nine files are shared and
every hunk is additive; the CSS hunks do not overlap (WP-36 at 142/226/899, WP-38 at 1310/1347).

Two deliberate duplicates, each carrying a merge note at its definition: `safe_parse_json` is
byte-identical on both branches — delete one copy. `split_json_object` exists on both and they are
**not** identical: WP-36's returns an unstripped aftermath, WP-38's strips and uses `.presence`, and
both of WP-38's callers rely on that. Keep WP-38's and run WP-36's motion parser tests.

`.gitignore` will conflict textually. Take both sides.

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

## 8. What is where

| | |
|---|---|
| `engines/content_engine/app/services/content_engine/lesson_video_publisher.rb` | the heart: body edit, offset-aware rebuild, the refusals |
| `engines/content_engine/app/services/content_engine/lesson_section_parser.rb` | `parse_heading_video`, `split_json_object` |
| `engines/learning_routes_engine/app/views/…/lesson_sections/_video.html.erb` | the partial; no Stimulus, nothing reads a controller off it |
| `app/controllers/admin/api/base_controller.rb` | token auth, audit, no-store |
| `app/controllers/admin/api/routes_controller.rb` | the tree the studio picks a step from |
| `app/controllers/admin/api/step_videos_controller.rb` | POST and DELETE, byte validation |
| `test/system/video_lesson_test.rb` | what a student sees, including the contrast ratchet |
| `.superpowers/sdd/2026-09-16-wp38-video-lessons/progress.md` | every ruling made during execution, with its cost-if-wrong |
