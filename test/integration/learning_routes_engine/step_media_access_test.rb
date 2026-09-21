require "test_helper"
require "support/video_lesson_helpers"

# WP-38 Task 10 / F1. The lesson PAGE is entitlement-gated
# (steps_controller.rb:173, ModuleAccessPolicy → RoutePurchase.entitled?). The film
# behind it was not: `rails_storage_proxy_path` produces a URL that is unguessable
# but permanent and unauthenticated — Active Storage says so itself, in the warning
# at the top of its own ProxyController ("All Active Storage controllers are
# publicly accessible by default ... permanent by design").
#
# So one student opening devtools, copying the `<source src>` and pasting it into a
# group chat published the film to everyone, forever, with no purchase and no
# session. This file is the gate: the same four before_actions as `steps#show`,
# in front of the bytes.
module LearningRoutesEngine
  class StepMediaAccessTest < ActionDispatch::IntegrationTest
    include VideoLessonHelpers

    setup do
      @step = create_route_step_for_video
      @owner = @video_user
      @route = @step.learning_route

      @step.lesson_video.attach(
        io: StringIO.new(mp4_bytes), filename: "l.mp4", content_type: "video/mp4"
      )
      @step.lesson_subtitles.attach(
        io: StringIO.new(srt_bytes), filename: "l.srt", content_type: "application/x-subrip"
      )
    end

    def video_url_for(step = @step) =
      learning_routes_engine.video_route_step_path(step.learning_route_id, step)

    def subtitles_url_for(step = @step) =
      learning_routes_engine.subtitles_route_step_path(step.learning_route_id, step)

    test "an anonymous request is sent to sign in, not to the film" do
      get video_url_for

      assert_redirected_to Core::Engine.routes.url_helpers.sign_in_path
      assert_no_match(/ftyp/, response.body, "the bytes leaked into the redirect body")
    end

    test "a signed-in stranger is refused" do
      stranger = create_test_user(email_verified_at: Time.current)
      sign_in_as(stranger)

      get video_url_for

      assert_response :forbidden
      assert_no_match(/ftyp/, response.body)
    end

    test "the entitled owner gets the film" do
      sign_in_as(@owner)

      get video_url_for

      assert_response :success
      assert_equal "video/mp4", response.media_type
      assert_match(/inline/, response.headers["Content-Disposition"].to_s)
      assert_equal mp4_bytes, response.body.b
    end

    # The whole reason for send_blob_stream over a hand-rolled send_data: a <video>
    # element seeks by asking for byte ranges, and a server that answers 200 with the
    # whole file to every Range request cannot be scrubbed.
    test "a Range request is answered 206, with the range it asked for" do
      sign_in_as(@owner)

      get video_url_for, headers: { "Range" => "bytes=0-9" }

      assert_response :partial_content
      assert_equal "bytes 0-9/#{mp4_bytes.bytesize}", response.headers["Content-Range"]
      assert_equal "bytes", response.headers["Accept-Ranges"]
      assert_equal mp4_bytes.byteslice(0, 10), response.body.b
    end

    # One sign-in per test: signing a second user into a session that already has one
    # does not re-authenticate, it just follows the redirect for an already-signed-in
    # visitor, and the "stranger" half of a chained test silently becomes the owner.
    test "the captions are gated for an anonymous visitor" do
      get subtitles_url_for
      assert_redirected_to Core::Engine.routes.url_helpers.sign_in_path
    end

    test "the captions are gated for a stranger" do
      sign_in_as(create_test_user(email_verified_at: Time.current))

      get subtitles_url_for

      assert_response :forbidden
    end

    test "the entitled owner gets the captions" do
      sign_in_as(@owner)

      get subtitles_url_for

      assert_response :success
      assert_equal srt_bytes, response.body
    end

    # A step that has no film answers 404 rather than 500 — the section is gone but
    # the route still exists, which is exactly the state an unpublish leaves behind.
    test "a step with nothing attached is a 404, not a 500" do
      bare = create_route_step_for_video
      sign_in_as(@video_user)

      get video_url_for(bare)

      assert_response :not_found
    end

    # The response must never be stored by a shared cache: it is entitled content
    # keyed to a session, and Active Storage's own proxy sets `public` here.
    test "the film is not cacheable by a shared cache" do
      sign_in_as(@owner)

      get video_url_for

      assert_response :success
      assert_match(/private/, response.headers["Cache-Control"].to_s)
      assert_no_match(/public/, response.headers["Cache-Control"].to_s)
      # Rack::Deflater is mounted app-wide with no type filter; `no-transform` is
      # what stops it gzipping the film and dropping Content-Length with it.
      assert_match(/no-transform/, response.headers["Cache-Control"].to_s)
    end
  end
end
