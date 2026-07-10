require "test_helper"

module ContentEngine
  class AiContentTest < ActiveSupport::TestCase
    test "requires body" do
      content = AiContent.new(body: nil)
      assert_not content.valid?
      assert_includes content.errors[:body], "can't be blank"
    end

    test "content_type enum values" do
      assert_equal({ "text" => 0, "code" => 1, "explanation" => 2, "exercise" => 3 }, AiContent.content_types)
    end

    test "audio stale-generating detection and recovery" do
      step = build_route_step
      content = AiContent.create!(route_step_id: step.id, content_type: "text", body: "x", audio_status: "generating")

      # Fresh "generating" is not stale.
      assert_not content.audio_stale_generating?
      assert_not content.reset_if_stale_audio!

      # Age it past the stale window.
      content.update_column(:updated_at, (AiContent::AUDIO_STALE_AFTER + 1.minute).ago)
      assert content.audio_stale_generating?
      assert_includes AiContent.audio_stale_generating, content

      assert content.reset_if_stale_audio!
      assert_equal "failed", content.reload.audio_status
      assert content.audio_error_message.present?
      assert_not content.audio_stale_generating?
    end

    private

    def build_route_step
      user = Core::User.create!(email: "ac-#{SecureRandom.hex(4)}@example.com", password: "password123", name: "AC", role: :student)
      profile = LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
      route = LearningRoutesEngine::LearningRoute.create!(learning_profile: profile, topic: "T")
      LearningRoutesEngine::RouteStep.create!(learning_route: route, position: 0, title: "S")
    end
  end
end
