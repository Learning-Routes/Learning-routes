# WP-38 — A lesson video inside a route step, published from the Manim Studio

Branch: `wp38-video-lessons`, off `main` at `39f7fa2` or later. **Independent of `wp36-narrated-scenes`**
(WP-36 touches `app/motion`, `_motion.html.erb`, `AiClient`; this package touches `LessonBlocks`,
`LessonSectionParser` for one new heading type, one new partial, one new admin API namespace and
`RouteStep` attachments). It can run in a second session and merge before or after WP-36.

The owner's words, 16 September: *"¿podemos ir probando generación automática ya integrada en un curso
en Learning Routes?"* The generation already exists and runs on his Mac: `english-ai-videos/experiments/
manim_voiceover_poc/` writes a 7-minute bilingual lesson script with a model, records it with ElevenLabs
segment by segment (`language_code` per segment, word timings), renders it with Manim and files the mp4
plus an `.srt`. **What is missing is the last metre: a step of a route that shows that video to the
student, and a door the studio can push it through.** This package builds the door and the block.
Rendering stays on the Mac — Manim, ffmpeg and pango are not going into the Docker image, and the
server "va justo" (audit, 7 September).

House rules, unchanged: bugs before features — this is a feature, so it queues behind WP-33's deploy and
live checks, which the owner runs in parallel from his terminal; every fix ships with the test that
prevents its class, shown red first; a guard test added beside a fix is seen red by breaking the fix;
when a block draws, the test measures what the student sees; every claim in the handoff is something
you ran; English throughout; git through the owner's terminal only. Work it with the superpowers skills
in the same order as WP-36: `brainstorming` → spec (owner's yes) → `writing-plans` → `executing-plans`
with `test-driven-development` → `verification-before-completion` → `requesting-code-review`.

---

## §1 — The `video` block

Add `"video"` to `LessonBlocks::BLOCKS` (`engines/content_engine/app/services/content_engine/
lesson_blocks.rb`) as a **heading-authored** block like `visual` and `motion`: `fence: nil`,
`headings: %w[Video Vídeo]`, `partial: "video"`, `chrome: nil`. Adding a type means, per the contract
test `lesson_block_contract_test.rb`: a parser branch, a partial, a Stimulus controller (or an explicit
"none needed" entry, if the contract allows it — read the test first), and a prompt-section decision.
**The generation prompt does not learn this block**: the model never writes `## Video:`; only the
studio's upload does. Say so where the contract test expects the prompt section, the way `audio` is
declared `authored: false`.

The section shape, as persisted in `step.metadata["parsed_sections"]` by `SectionResolver`:

```ruby
{ "type" => "video", "title" => "La ese de la tercera persona",
  "video_url" => "<rails_storage_proxy_path of the mp4>", "subtitles_url" => "<… of the .srt or nil>",
  "duration_seconds" => 477, "source" => "manim-studio", "lesson_id" => "third-person-s",
  "voice" => "english-teacher", "published_at" => "2026-09-16T13:00:04Z" }
```

`LessonSectionParser#parse_heading_video(title_from_heading, body)` mirrors `parse_heading_visual`:
the body is a JSON object with those keys (the studio writes it), `safe_parse_json` protects it, and
an unparsable body degrades to a `concept` exactly like a schema-rejected motion block does — **a
broken upload must never reach a student as a blank box** (WP-36 rule). Enrichment carry-over
(`SectionEnrichment::KEYS`, WP-33 §1) is not involved: the video's URLs are part of the section
body, not enrichment, so a re-parse keeps them by construction — add the test that proves it
(`wp33:reparse_census` counts must not change when a step has a video section).

The partial `engines/learning_routes_engine/app/views/learning_routes_engine/steps/lesson_sections/
_video.html.erb`: badge `VIDEO`, `block_title(section)` as the heading (never a persisted
translation, WP-33 §4), then

```erb
<video controls preload="metadata" playsinline style="width:100%; border-radius:14px; background:#000"
       data-controller="lesson-video" data-lesson-video-step-id-value="<%= step.id %>">
  <source src="<%= section["video_url"] %>" type="video/mp4">
  <% if section["subtitles_url"].present? %>
    <track kind="subtitles" srclang="es" label="Español" src="<%= section["subtitles_url"] %>" default>
  <% end %>
</video>
```

plus the duration as `m:ss` under it, from `duration_seconds`, and the app's CSS tokens. The
`lesson-video` Stimulus controller does one thing: when the student reaches 90 % of the video it
posts nothing and changes nothing server-side — it only adds `data-watched="true"` so the interactive
lesson controller can treat the section as seen for its own reveal logic. **A video is not a gated
block**: confirm in `AdvancementPolicy` / the gate that only interactive types count, and add the
test: a step whose only sections are `video` + `concept` completes without any block attempt.

Measured legibility: the system test asserts the `<video>` element's rendered width ≥ 320 px on a
375-px viewport, that the badge and title have contrast ≥ 4.5 in both themes, and that the
`<track>` element is present when subtitles were uploaded.

## §2 — The attachment and where the file lives

Active Storage is installed (the `active_storage_*` tables are in `db/structure.sql`) with the
`Disk` service on the **persisted named volume** `learning_routes_storage:/rails/storage`
(`config/deploy.yml`), and nothing uses it yet. This package is the first:

```ruby
class RouteStep
  has_one_attached :lesson_video      # video/mp4, ≤ 300 MB
  has_one_attached :lesson_subtitles  # text/vtt or application/x-subrip, ≤ 1 MB
```

URLs in the section are **proxy** URLs (`rails_storage_proxy_path`), because
`ActiveStorage::Blobs::ProxyController` answers HTTP Range requests and a video the student cannot
seek in is a defect. Test: a request with `Range: bytes=0-99` gets `206` and 100 bytes. Do **not**
serve through `send_file` the way `AudioController` does — `send_file` does not do ranges.

Content-type is verified from the bytes, not the filename: the first 12 bytes of an mp4 contain
`ftyp` at offset 4; anything else is rejected with 422 and a message. Subtitles are decoded as UTF-8
and must start with `1\n` or `WEBVTT`.

## §3 — The door: an owner-token API for the studio

`namespace :admin do namespace :api do … end end`, controllers under `Admin::Api::` inheriting from a
new `Admin::Api::BaseController` that **does not** use the session: it authenticates with
`authenticate_or_request_with_http_token` against `Rails.application.credentials.dig(:studio,
:api_token)` using `ActiveSupport::SecurityUtils.secure_compare`, returns JSON only, sets the same
no-store headers as `Admin::BaseController`, and still records `OwnerAuditEvent` with
`action: "owner.studio_api"`. A missing credential means the API is **off** (401 for everything),
never open. Rate limit with `Rack::Attack` if it is already in the Gemfile; otherwise 30 requests per
minute per token via `Rails.cache`, tested.

Endpoints:

- `GET /admin/api/routes` → `[{ id, title, level, modules: [{ id, title, position, steps: [{ id,
  position, title, description, estimated_minutes, has_video, video: { title, duration_seconds,
  published_at } | null }] }] }]` ordered by position. Preloaded (strict_loading is `:all` in test).
- `POST /admin/api/steps/:id/video` — multipart: `video` (file), `subtitles` (file, optional),
  `title`, `duration_seconds`, `lesson_id`, `voice`. Attaches both, then **upserts the section**:
  if the step's latest lesson body has a `## Video:` heading section, replace its JSON body; else
  prepend one before the first section. Persist through `SectionResolver#parse_and_persist!` so
  `parsed_sections` is rebuilt with the video first, and with WP-33's locking and `merge_metadata!`.
  Returns `201 { step_id, section_index, video_url, subtitles_url }`. Re-uploading replaces the
  attachment (purge the old blob later, not inline) and the section, and is idempotent for the same
  file (compare checksums; return `200` with the existing URLs).
- `DELETE /admin/api/steps/:id/video` → purges attachments, removes the section, re-parses, `204`.

Tests that prevent the classes, each red first:

1. **"An open door."** No token → 401; wrong token → 401; missing credential → 401; correct token →
   200. An `OwnerAuditEvent` row exists after each authenticated call.
2. **"Not a video."** A PNG renamed `.mp4` → 422; a 301 MB body → 413; subtitles that are not SRT/VTT
   → 422; the step has no attachment afterwards.
3. **"The section vanished on re-parse."** Upload, then run `SectionResolver` again from the body:
   the video section is still first with the same URLs, and `wp33:reparse_census` counts are equal
   before and after.
4. **"The student cannot seek."** `Range: bytes=0-99` → 206.
5. **"A video became a gate."** A step with `video` + `concept` completes with zero attempts.
6. **"A blank box."** A `## Video:` section with an unparsable body renders as a concept with the
   title, not as an empty `<video>`.
7. **"The route tree leaks."** `GET /admin/api/routes` never includes `metadata`, user data or
   lesson bodies — only the fields listed; asserted on the JSON keys.

## §4 — Credentials and the owner's part

Two credentials, set by the owner from his terminal, never pasted anywhere: `studio: api_token:` in
`config/credentials.yml.enc` (development) and in `config/credentials/production.yml.enc`. He generates
one with `bin/rails secret | cut -c1-48` and puts the same value in the studio's own `.env`
(`experiments/manim_voiceover_poc/.env`, mode 600, git-ignored) as `LR_STUDIO_TOKEN`, with
`LR_BASE_URL=http://localhost:3000` for development. The handoff's first section says exactly these
commands (`EDITOR="nano" bin/rails credentials:edit` and `--environment production`), and reminds him
to commit both `.enc` files and deploy.

The studio side (Python, `publish.py` and the «Publicar» panel in the admin's Manim page) is written
and tested separately against this contract; it is not part of this package. Keep the contract above
exact — field names, status codes, multipart part names — because the client is already coded to it.

## §5 — What stays out

The generation itself (script, voice, Manim) stays on the Mac. No `video` in the AI prompt. No
autoplay, no analytics event beyond the existing ones, no download button (proxy URLs are enough).
Motion (WP-36) is unrelated: live scenes per student vs a finished film per step — they coexist in the
same lesson.

## Order

1. §2 attachments + proxy URL + Range test (red first).
2. §1 parser branch + partial + contract test + gate test + blank-box test.
3. §3 API base (token, audit, rate limit), then routes tree, then upload/delete with tests 1–3, 7.
4. System test: a seeded step with an uploaded fixture mp4 (a 2-second `ffmpeg -f lavfi` clip made in
   the test, not committed) plays in the browser; both themes; measured legibility.
5. Regression: three suites × 3, RuboCop clean, `lesson_block_contract_test.rb` green with the new
   type; `wp33:reparse_census` counts unchanged on the fixture route.

## Verification

Three suites, three runs each, from a clean base; RuboCop clean. In dev, with the token set: `curl -H
"Authorization: Bearer $LR_STUDIO_TOKEN" localhost:3000/admin/api/routes` returns the tree; a `curl -F
video=@…mp4 -F subtitles=@….srt -F title=… -F duration_seconds=… -F lesson_id=… -F voice=…` publishes to
a step; the step page shows the video first, seekable, with subtitles; the census counts match. Then
the owner publishes a real render from the studio panel and watches it as the student "Exos Trox".

`WP38_HANDOFF.md`: the two credential commands first, then the curl checks with their real output,
the suite numbers, and the one screenshot that matters — the video inside the step, dark theme.
