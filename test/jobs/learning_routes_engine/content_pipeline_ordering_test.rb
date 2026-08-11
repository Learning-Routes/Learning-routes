require "test_helper"

# Two regressions this file exists to prevent.
#
# 1. `lesson_content` ran against the 30s global request_timeout. A commit titled
#    "give lesson_content a 180s timeout" changed only a comment block, so the fix
#    was reported as shipped while the config was untouched for weeks. A config
#    assertion is cheap and would have caught it the same day.
#
# 2. ContentPipelineJob called MediaPrefetchJob.perform_now between section parsing
#    and mark_ready!, so the student watched a skeleton through every image and audio
#    generation — six threads, three retries each — for a lesson whose text was
#    already in the database. Enrichment belongs off the critical path.
class LearningRoutesEngine::ContentPipelineOrderingTest < ActiveJob::TestCase
  def setup
    @user = Core::User.create!(
      name: "Pipeline Ordering",
      email: "po-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "programming", locale: "es", status: :active
    )
    @step = @route.route_steps.create!(
      title: "Paso", position: 0, status: :available, content_type: "lesson",
      delivery_format: "text", level: 1
    )
  end

  # Short-circuits stage 1: stage_text_generation! returns an existing AiContent
  # rather than calling the model, so this test needs no API key and no stub.
  def seed_content!
    ContentEngine::AiContent.create!(
      route_step: @step,
      content_type: :text,
      body: "## Concepto\n\nLa nube es almacenamiento remoto.\n",
      ai_model: "test"
    )
  end

  test "lesson_content declares a timeout well above the 30s global" do
    defaults = Rails.application.config.ai_model_defaults[:lesson_content]

    assert defaults[:request_timeout].present?,
      "lesson_content has no request_timeout, so it runs against the 30s global. " \
      "An 8192-token lesson does not finish in 30s: the call fails, retries, and the " \
      "student waits minutes for a skeleton."
    assert_operator defaults[:request_timeout], :>=, 120,
      "lesson_content generates up to 8192 tokens; anything under 120s will time out often."
  end

  test "media enrichment is enqueued, never run inline" do
    seed_content!

    assert_enqueued_with(job: ContentEngine::MediaPrefetchJob) do
      LearningRoutesEngine::ContentPipelineJob.perform_now(@step.id)
    end
  end

  test "the step is marked ready before media enrichment runs" do
    seed_content!

    LearningRoutesEngine::ContentPipelineJob.perform_now(@step.id)

    metadata = @step.reload.metadata
    assert_equal true, metadata["content_ready"],
      "the lesson must be readable as soon as the text is parsed"
    assert_equal false, metadata["content_generating"],
      "the spinner must stop when the text is ready, not when the images are"
    assert metadata["parsed_sections"].is_a?(Array),
      "sections must be persisted before the step is advertised as ready"
  end
end
