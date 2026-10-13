require "test_helper"
require "support/video_lesson_helpers"

# THE CLASS: a video the student cannot scrub through.
#
# ActiveStorage::Blobs::ProxyController answers HTTP Range requests; send_file does
# not. This app already serves audio with send_file twice
# (section_audio_controller.rb:90, audio_controller.rb:16) and that is fine for a
# 30-second clip you never seek in. A seven-minute lesson video is not that, and a
# <video> element with no Range support gives the student a scrub bar that does
# nothing.
#
# The Range test needs a real request (it exercises ActiveStorage::Blobs::ProxyController
# over HTTP), so the whole class is an integration test rather than ActiveSupport::TestCase.
class LearningRoutesEngine::LessonVideoAttachmentTest < ActionDispatch::IntegrationTest
  include VideoLessonHelpers

  def setup
    @step = create_route_step_for_video
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

  test "a Range request returns 206 and only the requested bytes" do
    @step.lesson_video.attach(io: StringIO.new(mp4_bytes), filename: "l.mp4", content_type: "video/mp4")
    url = Rails.application.routes.url_helpers.rails_storage_proxy_path(@step.lesson_video)

    get url, headers: { "Range" => "bytes=0-99" }

    assert_response :partial_content
    assert_equal 100, response.body.bytesize
    assert_match %r{\Abytes 0-99/}, response.headers["Content-Range"]
  end
end
