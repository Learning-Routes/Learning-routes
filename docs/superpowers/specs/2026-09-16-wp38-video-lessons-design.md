# WP-38 — A lesson video inside a route step, published from the Manim Studio: design

Branch `wp38-video-lessons`, off `main` at `39f7fa2`. Independent of `wp36-narrated-scenes`
(31 commits, untouched here); the two can merge in either order.

Brief: `PROMPT_29_WP38_VIDEO_LESSONS_FROM_THE_STUDIO.md`. This spec is checked against it.
**Section numbers below are this document's own (1–11); the brief's are written `brief §N`.** Every
decision below either comes from the brief, from an answer the owner gave during this brainstorm, or
is marked **[new]** and carries the evidence I gathered for it.

## 1. What this builds

The last metre. Generation stays on the Mac (Manim, ffmpeg, pango are not going into the image, and
the server "va justo"). This package builds two things:

- a `video` lesson block, so a route step can show a finished film to the student;
- a token-authenticated door (`/admin/api/...`) the studio pushes an mp4 and an `.srt` through.

Out of scope, and named so no plan step drifts: the generation itself, any `video` entry in the AI
prompt, autoplay, analytics, a download button, and the studio's Python side (written and tested
separately against the contract in §6 — keep it exact, the client is already coded to it).

## 2. Decisions taken with the owner during this brainstorm

1. **Git: I commit, the owner pushes.** Same as WP-36. I create the branch and commit per task; I
   never push, never touch `main`, never merge. ("git through the owner's terminal only" in the brief
   turned out to mean pushing and merging, not committing.)
2. **No `lesson-video` Stimulus controller.** The brief specified one that sets `data-watched="true"`
   at 90 %. **[new]** I checked: nothing in the codebase reads `data-watched`.
   `interactive_lesson_controller.js` drives its reveal and gating off `dataset.gating` and
   `dataset.blockSatisfied`, and `video` is not a gating type — so the attribute would be inert DOM,
   the precise failure class WP-33 and WP-36 each hit. Dropped as YAGNI; the partial is plain markup
   and the controller arrives when a consumer does.
3. **Placement: prepend only when the step has zero `block_attempts`; otherwise append.** The
   response says which happened. See §4, which is where this gets interesting.

## 3. Verified facts this design rests on

Gathered by reading, not assumed.

| Claim | Verified |
|---|---|
| Active Storage tables exist; nothing uses attachments yet | 29 `active_storage_*` references in `db/structure.sql`; `has_one_attached`/`has_many_attached` appear nowhere. **This package is genuinely the first.** |
| `rack-attack` is available | `Gemfile:50`, `Gemfile.lock` 6.8.0, with `config/initializers/rack_attack.rb` already present. So the brief's `Rails.cache` fallback is not needed. |
| Storage service | `config/storage.yml` — `Disk`, `local` root `Rails.root/storage` (dev + production), `test` root `tmp/storage`. `config.active_storage.service = :local` in dev/production, `:test` in test. |
| No heading-prefix clash | Existing prefixes are Completa, Complete, Concept, Concepto, Consejo, Ejemplo, Emparejar, Escenario, Example, Flashcards, Match, Motion, Playground, Pregunta, Question, Resumen, Scenario, Simulacion, Simulation, Summary, Tip, Visual. `Video` / `Vídeo` are free. |
| The contract test does NOT require a Stimulus controller per type | It scans `data-action` only; a partial with none needs no controller. It also never scans `data-controller` — **[new]** so a missing controller would not be caught, which is a second reason not to add a decorative one. |
| No reverse prompt assertion | The contract asserts prompt → known type, never "every declared heading appears in the prompt". So `video` can carry headings and stay out of the prompt. |
| `authored: false` has no structural constraint | Nothing in the tests ties it to empty headings. `audio` uses `authored: false` with `headings: []`; `video` will use it with headings, which is a new shape and is fine. |
| `video` is not a gate, by construction | `BlockGrader::GATING_TYPES` is `check drag_drop fill_blank flashcards scenario`. The brief's test pins existing behaviour rather than changing it. |
| `OwnerAuditEvent.record!` | `(action:, actor: nil, subject: nil, request: nil, metadata: {})` — `actor` is optional, which matters because the studio API has no session user. |

## 4. The part the brief got wrong, and what replaces it

This is the load-bearing section. The brief says: *"Persist through `SectionResolver#parse_and_persist!`
so `parsed_sections` is rebuilt with the video first"* and *"Enrichment carry-over is not involved …
a re-parse keeps them by construction."* Three things are wrong with that, each verified.

**(a) `SectionResolver.call` will not re-parse a step that already has sections.** It returns the
persisted `parsed_sections` when present and only parses when there are none. Every generated step
has them. So editing the AiContent body and calling `call` would change nothing a student sees —
`parsed_sections` is a cache, which is the whole subject of WP-33.

**(b) `parse_and_persist!` is private, and it drops enrichment.** It writes a fresh parse with no
`SectionEnrichment.carry_over`; `wp33:reparse` uses carry-over precisely because a naive rebuild
deletes `image_url`, `image_status`, `image_error`, `image_fallback` — images the media jobs paid
for, which `MediaPrefetchJob` then buys again. The brief's "carry-over is not involved" is true of
the *video's own* URLs (they live in the section body) and false of everything else in the array.

**(c) Prepending re-points recorded student work.** `block_attempts.section_index` is positional, and
`SectionEnrichment.carry_over` is positional too — its own comment says *"Positional, because
`block_attempts.section_index` is positional."* WP-33's reparse task refuses to rewrite a step whose
section count changed for exactly this reason. Prepending shifts every index by one.

**The owner's decision:** prepend when the step has zero `block_attempts`; append otherwise; the
response reports `placement`.

**[new] One correction to the rationale, which I am not inheriting silently.** The owner's reasoning
was that a prepend only happens when there is no enrichment to shift. That does not hold: attempts
and enrichment are independent. A generated lesson with visuals that no student has yet opened has
zero attempts *and* paid-for `image_url`s. A positional carry-over after a prepend would copy
`old[0]`'s image onto the new `new[0]`, which is the video.

**So the rebuild is offset-aware**, and that is the design:

```
parse the edited body            -> fresh[]
placement = attempts.zero? ? :prepend : :append
if prepend: carry old[i] -> fresh[i + 1]     (the video at 0 receives nothing)
if append:  carry old[i] -> fresh[i]         (the video at n receives nothing)
write under with_lock + merge_metadata!
```

It lives as a new **public** entry point rather than reaching into `SectionResolver`'s privates —
`SectionResolver.rebuild_with_enrichment!(step, offset:)` or a small dedicated service. Task 3 picks
the shape; the constraint is that it is public, tested, and the only place this rebuild happens.

The brief's own census test is what proves it: `wp33:reparse_census` image counts must be equal
before and after an upload. With a naive rebuild they would not be.

## 5. The attachment, and why the URL is a proxy

```ruby
class RouteStep
  has_one_attached :lesson_video      # video/mp4, <= 300 MB
  has_one_attached :lesson_subtitles  # text/vtt or application/x-subrip, <= 1 MB
```

The section stores **proxy** URLs (`rails_storage_proxy_path`), because
`ActiveStorage::Blobs::ProxyController` answers HTTP Range requests and a video the student cannot
scrub through is a defect. Deliberately NOT `send_file`, which `AudioController` uses and which does
not do ranges — that difference is the whole reason this choice is written down.

Storage is the `Disk` service already configured: `Rails.root/storage` in development and production
(the persisted named volume `learning_routes_storage:/rails/storage`), `tmp/storage` in test.

## 6. The API contract — exact, because the client is already coded to it

`namespace :admin { namespace :api }`, controllers under `Admin::Api::`, inheriting a new
`Admin::Api::BaseController` that:

- authenticates with `authenticate_or_request_with_http_token` against
  `Rails.application.credentials.dig(:studio, :api_token)` using
  `ActiveSupport::SecurityUtils.secure_compare`;
- **a missing credential means the API is off — 401 for everything, never open**;
- sets `Cache-Control: private, no-store`, as `Admin::BaseController:13` does;
- records `OwnerAuditEvent.record!(action: "owner.studio_api", actor: nil, request:, metadata:)` —
  `actor` is nil because there is no session user, and the signature already allows it;
- renders JSON only, never a session, never a redirect;
- rate-limits with `Rack::Attack` (present, 6.8.0) — 30 requests/minute per token.

| Endpoint | Returns |
|---|---|
| `GET /admin/api/routes` | `[{id, title, level, modules: [{id, title, position, steps: [{id, position, title, description, estimated_minutes, has_video, video: {title, duration_seconds, published_at} \| null}]}]}]`, ordered by position, preloaded (strict_loading is on). |
| `POST /admin/api/steps/:id/video` | multipart `video`, `subtitles?`, `title`, `duration_seconds`, `lesson_id`, `voice` → `201 {step_id, section_index, video_url, subtitles_url, placement}` |
| `DELETE /admin/api/steps/:id/video` | purge, remove section, rebuild → `204` |

Re-upload of the same bytes is idempotent: compare the Active Storage blob checksum and return
`200` with the existing URLs. A different file replaces the attachment and the section **in place, at
the same index**; the old blob is purged later, not inline. Replacing in place shifts nothing, so
re-upload stays allowed even on a step with recorded work.

### DELETE carries the same re-pointing hazard, and is guarded

**[owner, checkpoint]** §4 closes the hazard for upload and the first draft of this spec left it open
for unpublish. If the video was prepended (zero attempts at the time) and students recorded work
afterwards, their `section_index` values already include the `+1`. Removing the section would shift
every index back and re-point that work — the same class, in the opposite direction.

Unpublish is allowed when **either**:

- the step has zero `block_attempts`, or
- the video section is the **last** one — removing the final index shifts nothing, and no attempt can
  reference the video itself because `video` is not in `GATING_TYPES` and is not gradable.

Otherwise `409` and **nothing changes**:

```json
{ "error": "students have recorded work on this step; re-upload replaces the video, unpublish would re-point their attempts" }
```

**Validation is from the bytes, not the filename.** mp4: `ftyp` at offset 4 of the first 12 bytes,
else `422`. Subtitles: decodes as UTF-8 and starts with `1` or `WEBVTT`, else `422` — **[new]** with
a leading BOM and `\r\n` tolerated, because real `.srt` files routinely have both. Over 300 MB →
`413`, checked from `request.content_length` before reading the body.

**[new] `duration_seconds` is client-supplied and unverified.** There is no ffprobe in the image and
this package is not adding one. The handoff must say so: a studio that sends a wrong number produces
a wrong `m:ss` caption, and nothing detects it.

## 7. The block

`LessonBlocks::BLOCKS` gains `"video" => {fence: nil, headings: %w[Video Vídeo], partial: "video",
chrome: nil, authored: false}`.

**[owner, checkpoint] What actually keeps `## Video:` out of generation — and it is not
`authored: false`.** Verified: nothing derives the prompts from `LessonBlocks`, and `authored_types`
has **no caller anywhere outside `lesson_blocks.rb`**. The flag is a declaration, not a mechanism.
What keeps the model from writing `## Video:` is simply that `lesson_content.yml` never mentions it,
and the contract test only checks prompt → known type.

So `authored: false` stays — as the honest declaration that the app injects this section rather than
the model — and this package **makes it load-bearing** by adding the missing reverse assertion
(test 10): every authored type with headings must be requested by the prompt. Verified it passes
today, and it would go red if `video` were ever declared authored.

**Also verified:** `heading_map` iterates every entry in `BLOCKS` and maps `cfg[:headings]`
regardless of `authored`, so `## Video:` and `## Vídeo:` parse. (`audio` is absent from the map only
because its `headings` are `[]`, not because of its flag.)

`LessonSectionParser#parse_heading_video(title, body)` mirrors `parse_heading_visual`: the body is a
JSON object, `safe_parse_json` protects it, and **an unparsable body degrades to a `concept` carrying
the title** — never a blank `<video>`. That is WP-36's rule, and WP-36's `parse_heading_motion` is the
model to copy, including its fenced-JSON tolerance.

The partial renders the badge, `block_title(section)` (never a persisted translation — WP-33 §4),
the `<video controls preload="metadata" playsinline>` with its `<source>` and optional `<track>`, and
the duration as `m:ss`, using the app's CSS tokens. **[new] Both the stage and the text must be
legible in both themes** — WP-36 shipped a canvas that was invisible on dark, and the lesson page
stamps `data-theme` from the user's preference. The system test asserts contrast ≥ 4.5 for the badge
and title in dark *and* light, the rendered `<video>` width ≥ 320 px at a 375 px viewport, and the
`<track>` present when subtitles were uploaded.

## 8. Tests, and the class each prevents

Every one red first; every guard proven by breaking the fix.

1. **An open door** — no token / wrong token / missing credential → 401; correct → 200; an
   `OwnerAuditEvent` row after each authenticated call.
2. **Not a video** — PNG renamed `.mp4` → 422; 301 MB → 413; non-SRT/VTT subtitles → 422; no
   attachment afterwards.
3. **The section vanished on re-parse** — after an upload the video section is still there with the
   same URLs, and `wp33:reparse_census` image counts are equal before and after. This is the test
   that catches §4's whole class.
4. **The student cannot seek** — `Range: bytes=0-99` → `206` with 100 bytes, through
   `ActiveStorage::Blobs::ProxyController`. Not `send_file`, which does not do ranges.
5. **A video became a gate** — a step of `video` + `concept` completes with zero attempts.
6. **A blank box** — an unparsable `## Video:` body renders as a concept with its title.
7. **The route tree leaks** — `GET /admin/api/routes` exposes only the listed fields; asserted on the
   JSON keys, never on a sample value.
8. **[new] Recorded work re-pointed (upload)** — upload to a step that HAS `block_attempts`: every
   attempt's `section_index` still names the same block type afterwards, and the placement was
   `append`. Without this, §4's whole argument is untested.
9. **[owner] Unpublish re-points recorded work** — a prepended video, then attempts, then `DELETE` →
   `409`; the section, both attachments and `parsed_sections` are all untouched. The mirror of 8.
10. **[owner] `authored: false` is load-bearing** — every authored type with headings is requested by
   `lesson_content.yml`. Green today (verified: nothing missing); red if `video` were declared
   authored. Proven by removing `authored: false` from the video entry and watching it fail.

## 9. Order

1. **The attachment** (§5): `has_one_attached` on both, proxy URLs, the Range test.
2. **The block** (§7): parser branch, partial, contract test green with the new type, the not-a-gate
   test, the blank-box test.
3. **The API** (§6): base controller first (token, audit, rate limit), then the routes tree, then
   upload and delete — carrying the offset-aware rebuild of §4 and tests 1–3, 7, 8.
4. **System test**: a step seeded with a 2-second `ffmpeg -f lavfi` clip generated in the test (never
   committed) plays in the browser, both themes, measured legibility.
5. **Regression**: three suites × 3 from a clean base, RuboCop clean, `wp33:reparse_census` counts
   unchanged on the fixture route.

## 10. Risks

| Risk | Handling |
|---|---|
| A naive rebuild deletes paid-for images | §4's offset-aware carry-over; test 3's census equality is the proof |
| Prepending re-points recorded work | Prepend only at zero attempts; test 8 |
| Unpublishing re-points recorded work | 409 unless zero attempts or the video is last; test 9 |
| `ffmpeg` missing on the machine running the system test | Detect and **skip with an explicit message**, never silently — the WP-36 node-version precedent |
| 301 MB test is slow or is cut by Rack/Puma before the controller | Assert on `request.content_length` handling rather than streaming 301 MB; if Rack cuts first, say so in the handoff rather than claiming a controller behaviour |
| `duration_seconds` unverified | Stated in the handoff; no ffprobe is being added |
| Owner's two credentials not set | The API is off (401) until they are; the handoff leads with the two commands |

## 11. What the owner runs

The handoff opens with these, and nothing else precedes them:

```
EDITOR="nano" bin/rails credentials:edit                       # studio: api_token:
EDITOR="nano" bin/rails credentials:edit --environment production
```

then the same token into `experiments/manim_voiceover_poc/.env` (mode 600, git-ignored) as
`LR_STUDIO_TOKEN`, with `LR_BASE_URL=http://localhost:3000`; then commit both `.enc` files and
deploy. Then the curl checks, their real output, the suite numbers, and one screenshot: the video
inside the step, dark theme.
