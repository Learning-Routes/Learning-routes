require "test_helper"

# P1-8: ContentPipelineJob wrote `content_error` into step metadata and nothing read it.
# It also clears `content_generating` on failure, so a permanently-failing step looked
# identical to one that had never started — every page view re-enqueued the same failing
# pipeline and re-paid for the same failing AI calls, while the student saw a skeleton
# and then a hardcoded English timeout.
class LearningRoutesEngine::ContentFailureTest < ActionDispatch::IntegrationTest
  def setup
    @user = Core::User.create!(
      name: "Content Failure",
      email: "cf-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "programming", locale: "en", status: :active
    )
    @step = @route.route_steps.create!(
      title: "Step", position: 0, status: :available, content_type: "lesson",
      delivery_format: "text", level: 1
    )
    post "/sign_in", params: { email: @user.email, password: "password123" }
  end

  # The engine is mounted at /learning, so the bare /routes/... path is a 404.
  # Use the engine's own helper rather than hardcoding the mount prefix.
  def step_url
    learning_routes_engine.route_step_path(@route, @step)
  end

  def fail_step!(attempts:, failed_at: Time.current)
    @step.update!(metadata: (@step.metadata || {}).merge(
      "content_error" => "OpenAI request failed: boom",
      "content_failed_at" => failed_at.iso8601,
      "content_attempts" => attempts,
      "content_generating" => false
    ))
  end

  test "a recently failed step renders the failure state and does not re-enqueue" do
    fail_step!(attempts: 1)

    assert_no_enqueued_jobs(only: LearningRoutesEngine::ContentPipelineJob) do
      get step_url
    end

    assert_response :success
    # ERB escapes the apostrophe in "couldn't", so compare against escaped text.
    assert_match ERB::Util.html_escape(I18n.t("learning_engine.content_failed.title")), response.body
  end

  test "the failure state is localized, not hardcoded English" do
    @user.update!(locale: "es")
    fail_step!(attempts: 1)

    get step_url

    assert_response :success
    assert_match ERB::Util.html_escape(I18n.t("learning_engine.content_failed.title", locale: :es)), response.body
    assert_no_match(/We couldn't build this lesson/, response.body)
  end

  test "the raw pipeline exception is never shown to the student" do
    fail_step!(attempts: 1)

    get step_url

    assert_no_match(/OpenAI request failed: boom/, response.body)
  end

  test "it retries once the backoff has elapsed" do
    backoff = Rails.application.config.content_generation_retry_backoff
    fail_step!(attempts: 1, failed_at: (backoff * 4).ago)

    assert_enqueued_with(job: LearningRoutesEngine::ContentPipelineJob) do
      get step_url
    end
  end

  test "it stops retrying after the attempt cap regardless of elapsed time" do
    max = Rails.application.config.content_generation_max_attempts
    fail_step!(attempts: max, failed_at: 30.days.ago)

    assert_no_enqueued_jobs(only: LearningRoutesEngine::ContentPipelineJob) do
      get step_url
    end

    assert_match ERB::Util.html_escape(I18n.t("learning_engine.content_failed.exhausted")), response.body
  end

  test "a step that has never been attempted still enqueues normally" do
    assert_enqueued_with(job: LearningRoutesEngine::ContentPipelineJob) do
      get step_url
    end
  end

  test "the failed state does not poll" do
    # content_status re-runs load_step_content, so polling a permanently-failed step
    # every 3 seconds is what kept the re-enqueue loop running unseen.
    fail_step!(attempts: 1)

    get step_url

    assert_no_match(/data-controller="content-poll"/, response.body)
  end

  test "backoff grows with each attempt" do
    # Attempt 2 waits twice as long as attempt 1, so a step that keeps failing costs
    # progressively less rather than re-billing on every page view.
    backoff = Rails.application.config.content_generation_retry_backoff

    fail_step!(attempts: 2, failed_at: (backoff * 1.5).ago)
    assert_no_enqueued_jobs(only: LearningRoutesEngine::ContentPipelineJob) do
      get step_url
    end

    fail_step!(attempts: 2, failed_at: (backoff * 3).ago)
    assert_enqueued_with(job: LearningRoutesEngine::ContentPipelineJob) do
      get step_url
    end
  end
end
