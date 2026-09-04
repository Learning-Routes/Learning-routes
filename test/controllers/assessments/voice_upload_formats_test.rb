require "test_helper"

# THE CLASS: the client and the server keep two lists of the same vocabulary and
# nothing keeps them in sync.
#
# This is the fifth instance of that shape here — the block-type vocabulary was
# the first four, which is why `ContentEngine::LessonBlocks` exists.
#
# `voice_recorder_controller#_supportedMimeType` offers Chrome
# "audio/webm;codecs=opus" FIRST, Chrome supports it, and the blob is uploaded
# with that exact string. `voice_responses_controller` compared it with
# `include?` — exact string equality — against a list written without codec
# parameters. So the server rejected 415 on the client's own first choice, and
# has done so for every recording ever made in Chrome.
#
# The candidate list here is READ FROM THE JAVASCRIPT rather than retyped. A
# hand-copied list in a test is a third copy of the vocabulary and would drift
# the same way the first two did.
module Assessments
  class VoiceUploadFormatsTest < ActionDispatch::IntegrationTest
    RECORDER_JS = Rails.root.join("app/javascript/controllers/voice_recorder_controller.js")

    def setup
      @user = create_test_user(email_verified_at: Time.current, locale: "es")
      profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoutesEngine::LearningRoute.create!(
        learning_profile: profile, topic: "Portugués", locale: "es", status: :active
      )
      preview = LearningRoutesEngine::RouteModule.find_by!(
        learning_route_id: @route.id, access_state: :preview
      )
      @step = @route.route_steps.create!(
        route_module: preview, title: "Audio", position: 0, status: :available,
        content_type: :lesson, delivery_format: "audio", level: :nv1, bloom_level: 1
      )
      post core.sign_in_path, params: { email: @user.email, password: "password123" }
    end

    # Every format the recorder can hand us must be accepted. Not "the ones we
    # remembered to list".
    test "every mime type the recorder can produce is accepted" do
      refused = client_candidates.reject { |mime| upload(mime) != 415 }

      assert_empty refused,
        "the recorder can produce these and the server answers 415 Unsupported " \
        "Media Type — the client's own candidates are refused by the server:\n  " +
        refused.join("\n  ")
    end

    test "the codec parameter is what was being rejected" do
      assert_not_equal 415, upload("audio/webm;codecs=opus"),
        "this is Chrome's first choice; it is the string the feature has always sent"
      assert_not_equal 415, upload("audio/webm"),
        "and the bare type must keep working"
    end

    # The guard must still refuse what it is for. Loosening it into a no-op would
    # be a worse bug than the one being fixed.
    test "a genuinely unsupported type is still refused" do
      assert_equal 415, upload("video/mp4")
      assert_equal 415, upload("application/zip")
      assert_equal 415, upload("audio/webmsomething")
    end

    test "parameters do not let an unsupported type through" do
      assert_equal 415, upload("video/mp4;codecs=avc1"),
        "stripping parameters must not turn the check into a prefix match"
    end

    # A sweep that reads nothing passes vacuously.
    test "the candidate list is actually being read from the recorder" do
      assert_operator client_candidates.size, :>=, 4,
        "could not parse _supportedMimeType's candidates from " \
        "#{RECORDER_JS.basename}; the test above would assert nothing"
      assert_includes client_candidates, "audio/webm;codecs=opus"
    end

    private

    # Parses the array literal out of `_supportedMimeType`.
    def client_candidates
      @client_candidates ||= begin
        source = RECORDER_JS.read
        body = source[/_supportedMimeType\s*\(\)\s*\{(.*?)\n\s*\}/m, 1].to_s
        literal = body[/const\s+types\s*=\s*\[(.*?)\]/m, 1].to_s
        literal.scan(/"([^"]+)"/).flatten
      end
    end

    def upload(content_type)
      file = Rack::Test::UploadedFile.new(
        StringIO.new("fake-audio-bytes"), content_type, original_filename: "voice.webm"
      )

      post assessments.voice_responses_path,
           params: { audio: file, route_step_id: @step.id }

      response.status
    end
  end
end
