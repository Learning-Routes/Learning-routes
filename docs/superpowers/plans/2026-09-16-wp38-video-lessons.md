# WP-38 Video Lessons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A route step can show a finished lesson video to the student, and the Manim Studio can publish one through a token-authenticated door — without ever re-pointing recorded student work or deleting paid-for images.

**Architecture:** The mp4 and `.srt` are Active Storage attachments on `RouteStep` (the app's first), served through `ActiveStorage::Blobs::ProxyController` so the student can seek. A new `video` block type renders them. The studio's upload edits the lesson body and rebuilds `parsed_sections` through one public, **offset-aware** service that carries enrichment forward and never shifts an index a `block_attempt` points at.

**Tech Stack:** Rails 8.1, Active Storage (Disk service, already configured), `rack-attack` 6.8.0 (already present), Minitest + Capybara/headless Chrome, `ffmpeg` (test fixture only, on the developer's machine).

**Spec:** `docs/superpowers/specs/2026-09-16-wp38-video-lessons-design.md` — read it first; this plan argues from it. Section references below written `spec §N` are that document's.

## Global Constraints

Every task's requirements implicitly include these.

- **English throughout** in code, comments and commit messages.
- **Git: commit, never push.** Create nothing on `main`, merge nothing, push nothing. The owner pushes.
- **The AI prompt never learns `## Video:`.** No edit to `lesson_content.yml` or `curriculum_design.yml`. Only the studio's upload writes that heading.
- **No Stimulus controller for video.** The brief specified one setting `data-watched="true"`; nothing reads it (verified), so it is not built. The partial is plain markup.
- **`safe_parse_json` is deliberately identical to WP-36's** — same name, same signature, same six-line body. WP-36 is unmerged and independent; defining it identically makes the second merge a trivial delete-one-copy instead of two near-identical helpers forever.
- **Attachment limits:** video `video/mp4` ≤ 300 MB; subtitles `text/vtt` or `application/x-subrip` ≤ 1 MB. **Type is decided from the bytes, never the filename.**
- **URLs in the section are proxy URLs** (`rails_storage_proxy_path`). Never `send_file` — `section_audio_controller.rb:90` and `audio_controller.rb:16` use it and it does not answer Range requests.
- **Placement:** prepend when the step has zero `block_attempts`; append otherwise. Response reports `placement`.
- **Unpublish:** allowed only when zero `block_attempts` **or** the video section is last; otherwise `409` and nothing changes.
- **The rebuild is offset-aware** and carries `SectionEnrichment::KEYS` forward. `wp33:reparse_census` image counts must be equal before and after any publish or unpublish.
- **A missing `studio.api_token` credential means the API is OFF** — 401 for everything, never open.
- **TDD:** every test observed red before the code that makes it green. For a guard test, break the fix and watch **that** test go red. This repo shipped a guard in WP-33 whose fixture contained an earlier sufficient cause, so it passed without reaching the mechanism it named.
- **One test suite at a time** — the runner shares a test DB.
- **Verification includes the FULL main suite** (`bin/rails test`), not only an engine suite. A WP-36 regression hid for three tasks because per-task runs used `engines/content_engine/test` and the broken file lived under `test/`.

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `app/controllers/admin/api/base_controller.rb` | token auth, audit, no-store, JSON-only |
| `app/controllers/admin/api/routes_controller.rb` | the route tree |
| `app/controllers/admin/api/step_videos_controller.rb` | publish / unpublish |
| `engines/content_engine/app/services/content_engine/lesson_video_publisher.rb` | edit body + offset-aware rebuild (spec §4) |
| `engines/learning_routes_engine/app/views/.../lesson_sections/_video.html.erb` | the block |
| `test/controllers/admin/api/base_controller_test.rb` | test 1 — an open door |
| `test/controllers/admin/api/routes_controller_test.rb` | test 7 — the tree leaks |
| `test/controllers/admin/api/step_videos_controller_test.rb` | tests 2, 3, 8, 9 |
| `test/services/content_engine/lesson_video_publisher_test.rb` | the rebuild, offset and census |
| `test/integration/learning_routes_engine/video_block_rendering_test.rb` | test 6 — a blank box |
| `test/system/video_lesson_test.rb` | the browser, both themes |

**Modified**

| Path | Change |
|---|---|
| `engines/learning_routes_engine/app/models/learning_routes_engine/route_step.rb` | two `has_one_attached` |
| `engines/content_engine/app/services/content_engine/lesson_blocks.rb` | the `video` entry |
| `engines/content_engine/app/services/content_engine/lesson_section_parser.rb` | `parse_heading_video` + `safe_parse_json` |
| `config/routes.rb` | `namespace :admin { namespace :api }` |
| `config/initializers/rack_attack.rb` | one throttle |
| `test/services/content_engine/lesson_block_contract_test.rb` | test 10 — the reverse assertion |

---

## Task 0: Shared test support — build this first

Tasks 1, 5, 6, 7 and 8 all use these. Define them once, in
`test/support/video_lesson_helpers.rb`, and include the module where needed. Every later task's
code sample assumes exactly these names.

**Files:** Create `test/support/video_lesson_helpers.rb`.

**Interfaces:** Produces the constants and methods below. Nothing else in the plan defines them.

- [ ] **Step 1: Write the module**

```ruby
module VideoLessonHelpers
  TOKEN = "s" * 48

  def auth(token) = { "Authorization" => "Bearer #{token}" }

  # A real minimal mp4 header, not random bytes: Task 6 validates `ftyp` at offset 4,
  # so a fixture of zeroes would make that validation untestable.
  def mp4_bytes = "\x00\x00\x00\x20ftypisom".b + ("\x00".b * 256)

  # A real PNG magic number, for the "renamed .mp4" case.
  def png_bytes = "\x89PNG\r\n\x1a\n".b + ("\x00".b * 64)

  def srt_bytes = "1\r\n00:00:00,000 --> 00:00:02,000\r\nHola.\r\n"

  def fixture_upload(bytes, filename, content_type)
    Rack::Test::UploadedFile.new(StringIO.new(bytes), content_type, original_filename: filename)
  end

  # A step with a persisted parsed_sections array, which is the state every generated
  # step is in and the state the publisher has to handle.
  def step_with_sections(sections, body: "## Concepto: X\nCuerpo.\n")
    user = create_test_user(email_verified_at: Time.current)
    profile = LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
    route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Portugués", locale: "es", status: :active
    )
    preview = LearningRoutesEngine::RouteModule.find_by!(
      learning_route_id: route.id, access_state: :preview
    )
    step = route.route_steps.create!(
      route_module: preview, title: "Paso", position: 0, status: :available,
      content_type: "lesson", delivery_format: "text", level: :nv1, bloom_level: 1
    )
    ContentEngine::AiContent.create!(route_step: step, content_type: :text, body: body)
    step.update!(metadata: { "parsed_sections" => sections, "content_ready" => true })
    @video_user = user
    step
  end

  def create_route_step_for_video = step_with_sections([{ "type" => "concept", "body" => "x" }])

  # Columns read from the real table, not guessed: user_id, route_step_id,
  # section_index, block_type, payload and attempts are all NOT NULL.
  def record_attempt!(step, section_index:, block_type: "check")
    LearningRoutesEngine::BlockAttempt.create!(
      user: @video_user, route_step: step, section_index: section_index,
      block_type: block_type, payload: {}, attempts: 1
    )
  end

  def video_path(step) = "/admin/api/steps/#{step.id}/video"

  def base_params
    { title: "La ese de la tercera persona", duration_seconds: 477,
      lesson_id: "third-person-s", voice: "english-teacher" }
  end

  def full_params
    base_params.merge(video: fixture_upload(mp4_bytes, "l.mp4", "video/mp4"),
                      subtitles: fixture_upload(srt_bytes, "l.srt", "application/x-subrip"))
  end

  # What LessonVideoPublisher.publish! takes, without the HTTP layer.
  def payload
    base_params.merge(video_url: "/rails/active_storage/blobs/proxy/abc/l.mp4",
                      subtitles_url: "/rails/active_storage/blobs/proxy/def/l.srt",
                      source: "manim-studio", published_at: "2026-09-16T13:00:04Z")
  end
end
```

- [ ] **Step 2: Confirm the module loads**

Check how `test/test_helper.rb` picks up `test/support` — if it does not autoload that directory, require the file explicitly rather than adding a global autoload path.

- [ ] **Step 3: Commit**

---

## Task 1: The attachments, and a URL the student can seek in

**Files:**
- Modify: `engines/learning_routes_engine/app/models/learning_routes_engine/route_step.rb`
- Test: `test/models/learning_routes_engine/lesson_video_attachment_test.rb` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `RouteStep#lesson_video`, `#lesson_subtitles` (both `has_one_attached`), and the proxy-path helper every later task uses for URLs.

- [ ] **Step 1: Write the failing test**

```ruby
require "test_helper"

# THE CLASS: a video the student cannot scrub through.
#
# ActiveStorage::Blobs::ProxyController answers HTTP Range requests; send_file does
# not. This app already serves audio with send_file twice
# (section_audio_controller.rb:90, audio_controller.rb:16) and that is fine for a
# 30-second clip you never seek in. A seven-minute lesson video is not that, and a
# <video> element with no Range support gives the student a scrub bar that does
# nothing.
class LearningRoutesEngine::LessonVideoAttachmentTest < ActiveSupport::TestCase
  def setup
    @step = create_route_step_for_video   # helper: see Step 3
  end

  test "a step can hold a video and subtitles" do
    @step.lesson_video.attach(io: StringIO.new(mp4_bytes), filename: "l.mp4", content_type: "video/mp4")
    assert @step.reload.lesson_video.attached?
  end

  test "the section URL is a proxy URL, not a disk URL" do
    @step.lesson_video.attach(io: StringIO.new(mp4_bytes), filename: "l.mp4", content_type: "video/mp4")
    url = Rails.application.routes.url_helpers.rails_storage_proxy_path(@step.lesson_video)

    assert_match %r{\A/rails/active_storage/blobs/proxy/}, url,
      "a redirect or disk URL does not answer Range requests; the student cannot seek"
  end
end
```

- [ ] **Step 2: Write the Range request test**

This is the one that matters, and it is an integration test because it needs a real request:

```ruby
  test "a Range request returns 206 and only the requested bytes" do
    @step.lesson_video.attach(io: StringIO.new(mp4_bytes), filename: "l.mp4", content_type: "video/mp4")
    url = Rails.application.routes.url_helpers.rails_storage_proxy_path(@step.lesson_video)

    get url, headers: { "Range" => "bytes=0-99" }

    assert_response :partial_content
    assert_equal 100, response.body.bytesize
    assert_match %r{\Abytes 0-99/}, response.headers["Content-Range"]
  end
```

- [ ] **Step 3: Run them and record the RED**

Run: `bin/rails test test/models/learning_routes_engine/lesson_video_attachment_test.rb`
Expected: FAIL — `undefined method 'lesson_video'`. Record the output.

`mp4_bytes` must be a **real minimal mp4 header**, not random bytes, because Task 7 validates `ftyp` at offset 4: `"\x00\x00\x00\x20ftypisom" + "\x00" * 100`. Put it and `create_route_step_for_video` in a shared test helper both this file and Task 7's tests use.

- [ ] **Step 4: Implement**

```ruby
    # The app's FIRST Active Storage attachments. Disk service, Rails.root/storage in
    # dev and production (the persisted `learning_routes_storage` volume), tmp/storage
    # in test — all already configured in config/storage.yml.
    has_one_attached :lesson_video
    has_one_attached :lesson_subtitles
```

- [ ] **Step 5: Run to GREEN**, record it.

- [ ] **Step 6: Prove the Range test is load-bearing**

Point the test at a `rails_storage_redirect_path` (or a `send_file` action) instead of the proxy path and confirm the 206 assertion fails. Restore. Without this the test could be passing on a server that ignores Range and returns 200 with the whole body.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(video): lesson video and subtitle attachments, served as proxy URLs

The app's first Active Storage attachments. Proxy URLs, not send_file: the proxy
controller answers Range requests and a seven-minute video whose scrub bar does
nothing is a defect. Verified by pointing the test at a redirect URL and watching
the 206 assertion fail."
```

---

## Task 2: The `video` block

**Files:**
- Modify: `engines/content_engine/app/services/content_engine/lesson_blocks.rb`
- Modify: `engines/content_engine/app/services/content_engine/lesson_section_parser.rb`
- Create: `engines/learning_routes_engine/app/views/.../lesson_sections/_video.html.erb`
- Create: `test/integration/learning_routes_engine/video_block_rendering_test.rb`
- Modify: `test/services/content_engine/lesson_block_contract_test.rb`
- Test: `engines/content_engine/test/services/content_engine/section_parser_boundaries_test.rb`

**Interfaces:**
- Consumes: Task 1's attachments only indirectly (the partial reads URLs from the section).
- Produces: a section `{"type" => "video", "title", "video_url", "subtitles_url", "duration_seconds", "source", "lesson_id", "voice", "published_at"}`. Task 6's publisher writes exactly these keys.

- [ ] **Step 1: Write the failing parser tests**

```ruby
    # ── `## Video:` — a film, or a concept, never a blank player ──────────────
    #
    # Only the studio writes this heading; the model never does. A broken upload
    # must not reach a student as an empty <video> box.
    test "a video block parses to a video section with its urls" do
      body = <<~JSON
        {"title": "La ese de la tercera persona",
         "video_url": "/rails/active_storage/blobs/proxy/abc/l.mp4",
         "subtitles_url": "/rails/active_storage/blobs/proxy/def/l.srt",
         "duration_seconds": 477, "source": "manim-studio",
         "lesson_id": "third-person-s", "voice": "english-teacher",
         "published_at": "2026-09-16T13:00:04Z"}
      JSON
      section = parse_one_of("## Video: La ese de la tercera persona", body, "video")

      assert_equal "/rails/active_storage/blobs/proxy/abc/l.mp4", section[:video_url]
      assert_equal 477, section[:duration_seconds]
      assert_equal "manim-studio", section[:source]
    end

    test "an unparsable video body renders as a concept, never a blank player" do
      sections = LessonSectionParser.call(document("## Video: Roto", "{not json"))

      assert_nil sections.find { |s| s[:type] == "video" },
        "a broken upload must not reach the student as an empty <video>"
      assert sections.any? { |s| s[:type] == "concept" && s[:title].to_s.include?("Roto") },
        "the title survives as a concept so the student sees something"
    end

    test "the Spanish heading parses too" do
      body = '{"title":"T","video_url":"/x.mp4","duration_seconds":10}'
      assert parse_one_of("## Vídeo: T", body, "video")
    end
```

- [ ] **Step 2: Run, record the RED** (`## Video:` is not a known heading yet, so it degrades to a concept carrying raw JSON).

- [ ] **Step 3: Declare the type**

```ruby
      # Heading-authored by the STUDIO, not by the model. `authored: false` says the
      # app injects this section; what actually keeps `## Video:` out of generation is
      # that lesson_content.yml never mentions it (verified: nothing derives the
      # prompts from LessonBlocks, and authored_types has no caller outside this file).
      # The reverse assertion added to lesson_block_contract_test.rb in this package is
      # what makes the declaration load-bearing.
      "video" => {
        fence: nil, headings: %w[Video Vídeo], partial: "video", chrome: nil, authored: false
      },
```

`heading_map` iterates every entry and maps `cfg[:headings]` regardless of `authored`, so both prefixes parse. (Verified; `audio` is absent from that map only because its `headings` are `[]`.)

- [ ] **Step 4: Add the parser branch**

Beside `when :visual`, add `when :video then sections << parse_heading_video(title, body)`, and:

```ruby
    # `## Video: <title>` with a JSON body written by the studio's upload.
    # Mirrors parse_heading_visual in shape; mirrors WP-36's motion block in its
    # failure rule — anything unparsable degrades to a concept carrying the title,
    # never a blank player.
    def parse_heading_video(title_from_heading, body)
      payload = safe_parse_json(body.to_s.strip)

      unless payload.is_a?(Hash) && payload["video_url"].present?
        Rails.logger.warn("[LessonSectionParser] video block fell back to concept — bad body")
        return { type: "concept", title: title_from_heading.presence, body: body.to_s.strip }
      end

      {
        type: "video",
        title: (payload["title"].presence || title_from_heading.presence),
        video_url: payload["video_url"],
        subtitles_url: payload["subtitles_url"].presence,
        duration_seconds: payload["duration_seconds"],
        source: payload["source"],
        lesson_id: payload["lesson_id"],
        voice: payload["voice"],
        published_at: payload["published_at"],
        body: body.to_s.strip
      }
    end

    # Deliberately identical to WP-36's helper of the same name, so that whichever of
    # the two packages merges second resolves the conflict by deleting one copy.
    def safe_parse_json(text)
      return nil if text.nil?

      JSON.parse(text)
    rescue JSON::ParserError
      nil
    end
```

- [ ] **Step 5: Write the partial**

```erb
<%# A finished film, published by the studio. No Stimulus controller: the brief
    specified one setting data-watched="true" and nothing in the app reads that —
    interactive_lesson_controller.js gates on dataset.gating / dataset.blockSatisfied
    and video is not a gating type. Inert DOM is the failure class WP-33 and WP-36
    each hit, so it is not built until a consumer exists. %>
<div class="lesson-video">
  <span class="lesson-section-badge lesson-section-badge--video"><%= t("learning_engine.blocks.badge.video") %></span>
  <h3 class="lesson-video__title"><%= block_title(section) %></h3>

  <video controls preload="metadata" playsinline class="lesson-video__player">
    <source src="<%= section["video_url"] %>" type="video/mp4">
    <% if section["subtitles_url"].present? %>
      <track kind="subtitles" srclang="es" label="Español" src="<%= section["subtitles_url"] %>" default>
    <% end %>
  </video>

  <% if section["duration_seconds"].to_i.positive? %>
    <p class="lesson-video__duration"><%= format("%d:%02d", section["duration_seconds"].to_i / 60, section["duration_seconds"].to_i % 60) %></p>
  <% end %>
</div>
```

Add `learning_engine.blocks.badge.video` and `learning_engine.blocks.default_title.video` to **both** `en.yml` and `es.yml` — `block_titles_have_no_language_test.rb` asserts every declared type has a default title in both locales. Add `.lesson-video*` rules to `application.css` using the app's tokens, then `bin/rails tailwindcss:build`.

- [ ] **Step 6: The reverse assertion (test 10)**

```ruby
  # `authored: false` was, until this package, a declaration nothing enforced:
  # nothing derives the prompts from LessonBlocks and `authored_types` has no caller
  # outside lesson_blocks.rb. This is what makes it true.
  test "every authored heading type is requested by the lesson prompt" do
    requested = prompt_text(LESSON_PROMPT).scan(/^\s*##\s+([A-Za-zÁ-úñÑ]+):/).flatten.uniq
    authored = LB.authored_types.select { |t| LB::BLOCKS[t][:headings].any? }
    missing = authored.reject { |t| LB::BLOCKS[t][:headings].any? { |h| requested.include?(h) } }

    assert_equal [], missing,
      "declared authored (the model is expected to write them) but lesson_content.yml " \
      "never requests them: #{missing.inspect}. Either the prompt lost a block type, or " \
      "the type should be declared authored: false."
  end
```

Measured before promising it: this passes today (`missing` is `[]`).

- [ ] **Step 7: The not-a-gate test and the blank-box render test**

A step whose sections are `video` + `concept` completes with zero `block_attempts` (`GATING_TYPES` is `check drag_drop fill_blank flashcards scenario`, so this pins existing behaviour). And an unparsable `## Video:` renders as a concept in the actual view, not merely in the parser.

- [ ] **Step 8: Run everything to GREEN**

Run, one at a time: the boundaries suite, `lesson_block_contract_test.rb`, `block_titles_have_no_language_test.rb`, the new render test, then `bin/rails test`.

- [ ] **Step 9: Prove three guards load-bearing**

- Remove `authored: false` from the video entry → test 10 goes red naming `video`. Restore.
- Make `parse_heading_video` return the video section unconditionally → the blank-box test goes red. Restore.
- Delete the `video` partial → the contract test's "every declared type has a partial" goes red. Restore.

Record each.

- [ ] **Step 10: Commit**

---

## Task 3: The door — `Admin::Api::BaseController`

**Files:**
- Create: `app/controllers/admin/api/base_controller.rb`
- Modify: `config/routes.rb`, `config/initializers/rack_attack.rb`
- Test: `test/controllers/admin/api/base_controller_test.rb` (create)

**Interfaces:**
- Consumes: `OwnerAuditEvent.record!(action:, actor: nil, subject: nil, request: nil, metadata: {})` — `actor` is optional, which is why this API can have no session user.
- Produces: `Admin::Api::BaseController`, which Tasks 4, 7 and 8 inherit. It authenticates, audits, sets no-store, and renders JSON only.

- [ ] **Step 1: Write the failing test — test 1, "An open door"**

```ruby
require "test_helper"

# THE CLASS: an open door.
#
# This controller does NOT use the session — the studio is a Python script on the
# owner's Mac, not a browser. That makes the token the only thing between the
# public internet and a write endpoint, so every way of getting it wrong is pinned
# here: absent, malformed, wrong, and — the one that is easy to get backwards — a
# missing credential, which must mean OFF, never open.
class Admin::Api::BaseControllerTest < ActionDispatch::IntegrationTest
  TOKEN = "s" * 48

  # Mutating credentials.config is the shortest way to do this, but VERIFY IT WORKS
  # in this Rails version before building four tests on it — if the config hash is
  # frozen or memoised elsewhere, swap `Rails.application.credentials` for a stub
  # object and restore it in an `ensure` instead. `minitest/mock` is NOT in this
  # bundle, so `Object#stub` is unavailable; the house idiom is a singleton swap
  # restored in an `ensure` (see `with_refused_guard` in
  # test/services/content_engine/voice_evaluator_metering_test.rb).
  def with_token(value)
    original = Rails.application.credentials.config[:studio]
    Rails.application.credentials.config[:studio] = value.nil? ? nil : { api_token: value }
    yield
  ensure
    Rails.application.credentials.config[:studio] = original
  end

  def auth(token) = { "Authorization" => "Bearer #{token}" }

  test "no token is 401" do
    with_token(TOKEN) { get "/admin/api/routes" }
    assert_response :unauthorized
  end

  test "a wrong token is 401" do
    with_token(TOKEN) { get "/admin/api/routes", headers: auth("x" * 48) }
    assert_response :unauthorized
  end

  test "a missing credential means the API is OFF, not open" do
    with_token(nil) { get "/admin/api/routes", headers: auth(TOKEN) }
    assert_response :unauthorized,
      "with no studio.api_token configured the API must refuse everything; " \
      "an unset credential that compares equal to a supplied token is an open door"
  end

  test "the right token is accepted and audited" do
    assert_difference -> { OwnerAuditEvent.where(action: "owner.studio_api").count }, 1 do
      with_token(TOKEN) { get "/admin/api/routes", headers: auth(TOKEN) }
    end
    assert_response :success
    assert_equal "private, no-store", response.headers["Cache-Control"]
  end

  test "it never answers with a session or a redirect" do
    with_token(TOKEN) { get "/admin/api/routes", headers: auth(TOKEN) }
    assert_equal "application/json", response.media_type
  end
end
```

- [ ] **Step 2: Run, record the RED** (no route, no controller).

- [ ] **Step 3: Implement**

```ruby
module Admin
  module Api
    # The studio's door. Deliberately NOT Admin::BaseController: that one requires a
    # signed-in owner (`current_user&.owner?`) and renders HTML, and the studio is a
    # Python script with no session. What it borrows is the discipline —
    # Cache-Control: private, no-store, and an OwnerAuditEvent for every call.
    class BaseController < ActionController::API
      before_action :authenticate_studio!
      before_action :secure_api_response!
      after_action :audit_studio_access!

      private

      def authenticate_studio!
        expected = Rails.application.credentials.dig(:studio, :api_token).to_s

        # A missing credential means the API is OFF. Without this line an unset
        # credential is "" and a caller sending "" would compare equal.
        return head(:unauthorized) if expected.blank?

        authenticate_or_request_with_http_token do |token, _options|
          ActiveSupport::SecurityUtils.secure_compare(token.to_s, expected)
        end
      end

      def secure_api_response!
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["Pragma"] = "no-cache"
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
      end

      def audit_studio_access!
        return unless response.successful?

        OwnerAuditEvent.record!(
          action: "owner.studio_api", actor: nil, request: request,
          metadata: { controller: controller_path, action: action_name, status: response.status }
        )
      end
    end
  end
end
```

Routes:

```ruby
  namespace :admin do
    root "dashboard#show"
    resources :users, only: [:index, :show]
    resources :routes, only: [:show]

    namespace :api do
      resources :routes, only: [:index]
      # The studio publishes to a step, so the video is a singular nested resource.
      resources :steps, only: [] do
        resource :video, only: [:create, :destroy], controller: "step_videos"
      end
    end
  end
```

Throttle, following the file's existing idiom (`throttle("logins/ip", limit: 5, period: 60)`):

```ruby
  # Per TOKEN, not per IP: the studio is one script on one machine, and an IP
  # throttle would be useless against a leaked token and annoying for the owner.
  throttle("studio_api/token", limit: 30, period: 60) do |req|
    next unless req.path.start_with?("/admin/api/")

    req.get_header("HTTP_AUTHORIZATION").to_s.presence
  end
```

- [ ] **Step 4: Run to GREEN**, record it.

- [ ] **Step 5: Prove the missing-credential guard is load-bearing**

Delete the `return head(:unauthorized) if expected.blank?` line and confirm **"a missing credential means the API is OFF, not open"** goes red specifically. Restore. This is the one that turns a misconfiguration into an open write endpoint, so it must be seen failing.

- [ ] **Step 6: Test the throttle**

31 requests inside the window → the 31st is `429`. `Rack::Attack` must be enabled in the test environment for this; if it is disabled there, enable it for this one test and say so, or mark the test skipped **with an explicit message** — never silently.

- [ ] **Step 7: Commit**

---

## Task 4: `GET /admin/api/routes`

**Files:**
- Create: `app/controllers/admin/api/routes_controller.rb`
- Test: `test/controllers/admin/api/routes_controller_test.rb` (create)

**Interfaces:**
- Consumes: `Admin::Api::BaseController`.
- Produces: the JSON tree the studio reads to choose a step. Exact shape in spec §6 — the Python client is already coded to it, so field names are not yours to improve.

- [ ] **Step 1: Write the failing test — test 7, "The route tree leaks"**

Assert on the **key sets**, not on sample values:

```ruby
  ROUTE_KEYS  = %w[id title level modules].freeze
  STEP_KEYS   = %w[id position title description estimated_minutes has_video video].freeze

  test "the tree exposes exactly the agreed fields and nothing else" do
    get "/admin/api/routes", headers: auth(TOKEN)
    route = JSON.parse(response.body).first

    assert_equal ROUTE_KEYS.sort, route.keys.sort
    assert_equal STEP_KEYS.sort, route["modules"].first["steps"].first.keys.sort,
      "a step in this tree must never carry metadata, a lesson body or user data"
  end

  test "it never serialises metadata or a lesson body" do
    get "/admin/api/routes", headers: auth(TOKEN)

    assert_not_includes response.body, "parsed_sections"
    assert_not_includes response.body, "audio_sections"
  end
```

- [ ] **Step 2: RED. Step 3: implement**, preloading (`strict_loading` is on in test, so a lazy traversal raises — that is the environment telling you to include). Order by `position`.

- [ ] **Step 4: GREEN.**

- [ ] **Step 5: Prove the leak test is load-bearing** — add `metadata` to the step serializer, watch the key-set assertion go red naming it, remove it.

- [ ] **Step 6: Commit**

---

## Task 5: The publisher — the offset-aware rebuild

This is the heart of the package. Read spec §4 before writing a line.

**Files:**
- Create: `engines/content_engine/app/services/content_engine/lesson_video_publisher.rb`
- Test: `test/services/content_engine/lesson_video_publisher_test.rb` (create)

**Interfaces:**
- Consumes: `SectionEnrichment::KEYS` and `.carry_over`, `LessonSectionParser`, `RouteStep#merge_metadata!`.
- Produces: `LessonVideoPublisher.publish!(step:, payload:) -> {section_index:, placement:}` and
  `.unpublish!(step:) -> :ok | :conflict`. Tasks 6 and 7 call exactly these. **`placement` is a
  Symbol (`:prepend` / `:append`) in Ruby and therefore a String (`"prepend"` / `"append"`) once
  it has been through JSON** — Task 5's service tests assert the Symbol, Task 6's request tests
  assert the String. Both are in this plan and they are not in conflict.

**Why this service exists at all** (put this at the top of the file): `SectionResolver.call` returns the persisted `parsed_sections` and only parses when there are none, so it cannot refresh a generated step; `parse_and_persist!` is private **and** writes a fresh parse with no `carry_over`, so calling it would delete the `image_url`s the media jobs paid for. Verified: its only callers are `wp33_reparse.rake:161,258`, and both wrap it in carry-over themselves.

- [ ] **Step 1: Write the failing tests**

```ruby
  test "prepends when the step has no attempts, and carries enrichment forward by one" do
    step = step_with_sections([
      { "type" => "visual", "image_url" => "/paid/for.png", "image_status" => "ready" },
      { "type" => "concept" }
    ])

    result = ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload)

    sections = step.reload.metadata["parsed_sections"]
    assert_equal :prepend, result[:placement]
    assert_equal "video", sections[0]["type"]
    assert_equal "/paid/for.png", sections[1]["image_url"],
      "the image moved to index 1 with its section; a positional carry-over would " \
      "have put it on the video at index 0"
    assert_nil sections[0]["image_url"]
  end

  test "appends when the step has attempts, and carries enrichment forward in place" do
    step = step_with_sections([{ "type" => "check" }, { "type" => "visual", "image_url" => "/p.png" }])
    record_attempt!(step, section_index: 0)

    result = ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload)
    sections = step.reload.metadata["parsed_sections"]

    assert_equal :append, result[:placement]
    assert_equal "check", sections[0]["type"], "index 0 must still be what the attempt points at"
    assert_equal "/p.png", sections[1]["image_url"]
    assert_equal "video", sections.last["type"]
  end

  test "the census image count is unchanged by a publish" do
    step = step_with_sections([{ "type" => "visual", "image_url" => "/a.png" },
                               { "type" => "visual", "image_url" => "/b.png" }])
    before = ContentEngine::SectionEnrichment.image_url_count(step.metadata["parsed_sections"])

    ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload)

    after = ContentEngine::SectionEnrichment.image_url_count(step.reload.metadata["parsed_sections"])
    assert_equal before, after,
      "a rebuild that loses an image is a rebuild that makes MediaPrefetchJob buy it again"
  end

  test "unpublish refuses when students have recorded work and the video is not last" do
    step = step_with_sections([{ "type" => "check" }])
    ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload)   # prepended
    record_attempt!(step, section_index: 1)                                      # on the check
    frozen = step.reload.metadata["parsed_sections"]

    assert_equal :conflict, ContentEngine::LessonVideoPublisher.unpublish!(step: step)
    assert_equal frozen, step.reload.metadata["parsed_sections"], "nothing may change on a refusal"
  end

  test "unpublish is allowed when the video is last, even with attempts" do
    step = step_with_sections([{ "type" => "check" }])
    record_attempt!(step, section_index: 0)
    ContentEngine::LessonVideoPublisher.publish!(step: step, payload: payload)   # appended

    assert_equal :ok, ContentEngine::LessonVideoPublisher.unpublish!(step: step)
    assert_equal "check", step.reload.metadata["parsed_sections"][0]["type"]
  end
```

- [ ] **Step 2: RED. Step 3: implement.**

The shape, in words, because the exact code depends on how the body edit lands:

1. Edit the lesson body: replace an existing `## Video:` section's JSON in place, or insert one at the chosen end.
2. Parse the edited body → `fresh`.
3. `placement = step.block_attempts.none? ? :prepend : :append` (check the real association name first).
4. Carry enrichment with an offset: `prepend` → `old[i]` onto `fresh[i + 1]`; `append` → `old[i]` onto `fresh[i]`. The video receives nothing either way.
5. Write inside `with_lock` via `merge_metadata!` — never `update!(metadata:)`.

`unpublish!` mirrors it, and returns `:conflict` without writing anything when the step has attempts **and** the video is not the last section.

- [ ] **Step 4: GREEN. Step 5: prove two guards**

- Replace the offset-aware carry with a plain positional `SectionEnrichment.carry_over(old, fresh)` and confirm the **prepend** enrichment test goes red (the image lands on the video). Restore.
- Make `unpublish!` always proceed and confirm the refusal test goes red. Restore.

- [ ] **Step 6: Commit**

---

## Task 6: `POST /admin/api/steps/:id/video`

**Files:**
- Create: `app/controllers/admin/api/step_videos_controller.rb`
- Test: `test/controllers/admin/api/step_videos_controller_test.rb` (create)

**Interfaces:**
- Consumes: Task 1's attachments, Task 3's base controller, Task 5's `LessonVideoPublisher.publish!`.
- Produces: `201 {step_id, section_index, video_url, subtitles_url, placement}`; `200` with the same body when the bytes are identical.

- [ ] **Step 1: Write the failing tests — test 2 ("Not a video") and test 8 ("Recorded work re-pointed")**

```ruby
  test "a PNG renamed .mp4 is refused and nothing is attached" do
    post video_path(@step), headers: auth(TOKEN), params: base_params.merge(
      video: fixture_upload(png_bytes, "lesson.mp4", "video/mp4")
    )

    assert_response :unprocessable_entity
    assert_not @step.reload.lesson_video.attached?,
      "the filename said mp4 and the bytes said PNG; the bytes decide"
  end

  test "a body over 300 MB is refused with 413" do
    post video_path(@step), headers: auth(TOKEN).merge("CONTENT_LENGTH" => (301.megabytes).to_s),
         params: base_params.merge(video: fixture_upload(mp4_bytes, "l.mp4", "video/mp4"))

    assert_response :payload_too_large
    assert_not @step.reload.lesson_video.attached?
  end

  test "subtitles that are neither SRT nor VTT are refused" do
    post video_path(@step), headers: auth(TOKEN), params: base_params.merge(
      video: fixture_upload(mp4_bytes, "l.mp4", "video/mp4"),
      subtitles: fixture_upload("<html>nope</html>", "l.srt", "application/x-subrip")
    )

    assert_response :unprocessable_entity
    assert_not @step.reload.lesson_video.attached?, "a bad subtitle must not leave a half-published step"
  end

  test "re-uploading the same bytes is idempotent" do
    2.times { post video_path(@step), headers: auth(TOKEN), params: full_params }

    assert_response :ok
    assert_equal 1, @step.reload.metadata["parsed_sections"].count { |s| s["type"] == "video" }
  end

  # test 8
  test "publishing to a step with recorded work never re-points an attempt" do
    step = step_with_sections([{ "type" => "check" }, { "type" => "concept" }])
    record_attempt!(step, section_index: 0)

    post video_path(step), headers: auth(TOKEN), params: full_params

    assert_response :created
    assert_equal "append", JSON.parse(response.body)["placement"]
    sections = step.reload.metadata["parsed_sections"]
    assert_equal "check", sections[0]["type"],
      "the attempt at index 0 must still name the block it was recorded against"
  end
```

- [ ] **Step 2: RED. Step 3: implement.**

Validate from the bytes, before attaching anything:

```ruby
      # The filename is whatever the uploader typed. `ftyp` at offset 4 of the first
      # 12 bytes is what an mp4 actually is.
      def mp4?(io)
        head = io.read(12).to_s
        io.rewind
        head.byteslice(4, 4) == "ftyp"
      end

      # Real .srt files routinely carry a UTF-8 BOM and CRLF line endings; neither
      # makes them invalid, so strip both before looking.
      def subtitles?(io)
        text = io.read(64).to_s.force_encoding(Encoding::UTF_8)
        io.rewind
        return false unless text.valid_encoding?

        head = text.sub(/\A\xEF\xBB\xBF/n, "").lstrip
        head.start_with?("WEBVTT") || head.match?(/\A\d+\s*\r?\n/)
      end
```

Refuse **before** any attach, so a bad subtitle never leaves a half-published step. Size: check `request.content_length` and return `413` before reading the body.

- [ ] **Step 4: GREEN. Step 5: prove two guards**

- Make `mp4?` return `true` unconditionally → the PNG test goes red. Restore.
- Attach the video before validating the subtitles → the "half-published step" assertion goes red. Restore.

- [ ] **Step 6: Note for the handoff**

`duration_seconds` is taken from the request and never verified — there is no ffprobe in the image and this package is not adding one. A studio that sends a wrong number produces a wrong `m:ss` and nothing detects it. Say so; do not add a silent default that hides it.

- [ ] **Step 7: Commit**

---

## Task 7: `DELETE /admin/api/steps/:id/video`

**Files:**
- Modify: `app/controllers/admin/api/step_videos_controller.rb`
- Test: `test/controllers/admin/api/step_videos_controller_test.rb`

**Interfaces:**
- Consumes: `LessonVideoPublisher.unpublish!` from Task 5.
- Produces: `204`, or `409` with the exact body below.

- [ ] **Step 1: Write the failing test — test 9, "Unpublish re-points recorded work"**

```ruby
  test "unpublishing a prepended video that students have worked past is refused" do
    step = step_with_sections([{ "type" => "check" }])
    post video_path(step), headers: auth(TOKEN), params: full_params   # zero attempts -> prepend
    record_attempt!(step, section_index: 1)                            # the check is now at 1
    frozen = step.reload.metadata["parsed_sections"]

    delete video_path(step), headers: auth(TOKEN)

    assert_response :conflict
    assert_equal(
      "students have recorded work on this step; re-upload replaces the video, " \
      "unpublish would re-point their attempts",
      JSON.parse(response.body)["error"]
    )
    assert step.reload.lesson_video.attached?, "a refusal must change nothing"
    assert_equal frozen, step.reload.metadata["parsed_sections"]
  end

  test "unpublishing is allowed when the video is last" do
    step = step_with_sections([{ "type" => "check" }])
    record_attempt!(step, section_index: 0)
    post video_path(step), headers: auth(TOKEN), params: full_params   # attempts -> append

    delete video_path(step), headers: auth(TOKEN)

    assert_response :no_content
    assert_not step.reload.lesson_video.attached?
  end
```

- [ ] **Step 2: RED. Step 3: implement** — delegate the decision to `unpublish!`; the controller only maps `:conflict` to `409` and `:ok` to `204`. Purge both attachments only on `:ok`.

- [ ] **Step 4: GREEN. Step 5: prove it** — make `unpublish!` always return `:ok` and confirm the refusal test goes red, including the "nothing changed" assertions. Restore.

- [ ] **Step 6: Commit**

---

## Task 8: The browser

**Files:**
- Create: `test/system/video_lesson_test.rb`
- Modify: `test/application_system_test_case.rb` **only if** the browser refuses something

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Make the fixture in the test, never commit it**

```ruby
  # A two-second clip, generated here. Committing a binary fixture to prove a video
  # plays is how repositories grow megabytes nobody can regenerate.
  def build_clip!(path)
    unless system("which ffmpeg > /dev/null 2>&1")
      skip("ffmpeg is not installed; this test needs it to generate a 2-second clip")
    end
    system("ffmpeg -y -f lavfi -i testsrc=duration=2:size=320x240:rate=10 " \
           "-pix_fmt yuv420p #{Shellwords.escape(path.to_s)} > /dev/null 2>&1")
  end
```

The skip carries a message. A silently-skipped test is indistinguishable from a passing one — the WP-36 node-version precedent.

- [ ] **Step 2: Write the assertions**

- the `<video>` element's rendered width ≥ 320 px at a 375 px viewport;
- a `<track kind="subtitles">` exists when subtitles were uploaded, and does not when they were not;
- the badge and the title measure contrast ≥ 4.5 against their actual backing, **in `data-theme="dark"` and in `light`**, computed with the real WCAG formula (sRGB → linear with the 0.03928/12.92 branch, `L = 0.2126R + 0.7152G + 0.0722B`, `(L1+0.05)/(L2+0.05)`).

WP-36 shipped a canvas that was invisible on dark because nothing measured legibility; this is the same assertion applied to text, and it is cheap.

- [ ] **Step 3: Run, record. Step 4: prove the contrast assertion is load-bearing** — set the title's colour to the card's own background, watch it go red in both themes, restore.

- [ ] **Step 5: Commit**

---

## Task 9: Regression and handoff

**Files:** `WP38_HANDOFF.md`.

- [ ] **Step 1: Three suites, three runs each, from a clean base**, one at a time: `bin/rails test`, `bin/rails test:system`, `bin/rails test test engines/*/test`. The combined column carries four known pre-existing engine failures (`RouteGenerationJobTest`, `RouteGeneratorTest`, `GapAnalysisJobTest`, `ReinforcementJobTest`) and nothing else.
- [ ] **Step 2: `bundle exec rubocop`** clean.
- [ ] **Step 3: `wp33:reparse_census`** on a fixture route: image counts identical before and after a publish and an unpublish.
- [ ] **Step 4: The owner's curl checks**, with their real output, against a dev server with the token set.
- [ ] **Step 5: Write `WP38_HANDOFF.md`** — the two credential commands FIRST, then the curl checks with real output, the suite numbers, the census equality, and one screenshot: the video inside the step, dark theme.
- [ ] **Step 6: `requesting-code-review`** — a subagent review of the whole diff against the brief; findings in the handoff, fixed or argued.

---

## Notes for the executor

- **Nothing is ✅ because a piece works in isolation.** A step is done when the production path calls it.
- **Do not push.** The owner pushes. Do not touch `main`. Do not merge.
- **WP-36 is unmerged and independent.** `safe_parse_json` here is deliberately byte-identical to WP-36's so the second merge is a delete-one-copy. If you find yourself wanting to reuse `parse_heading_motion`, `split_json_object` or `MotionScenes`, stop — none of them exist on this branch, and depending on them would break the "either order" promise.
- **Verification includes the full main suite**, not only an engine suite.
- Any red you did not predict → `superpowers:systematic-debugging`. No "flaky", no retry-until-green.
