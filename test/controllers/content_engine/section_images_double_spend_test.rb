require "test_helper"

# Finding 6 of the first review round.
#
# WP-33 §1 put `mark_generating!` under `with_lock` and made it re-read, which
# closed the WRITE race. It did not close the DECISION race, and the decision is
# the one that spends money.
#
# `generate` reads the section through `SectionResolver` at the top of the
# request, returns early if `image_url` is already present, and only then calls
# `mark_generating!`. The read and the claim are in different critical sections,
# so two clicks that arrive before either job finishes both see `image_url` nil,
# both pass the early return, and both enqueue `SectionImageJob` — which calls
# the paid image API. `SectionImageJob:28` only catches a job enqueued after the
# first one has already committed a URL.
#
# The guard needed for this already existed and was written by nobody's reader:
# `mark_generating!` sets `image_status = "generating"` under the lock, and the
# only code that ever read `image_status` was the poll endpoint, checking for
# "failed". So the claim is made atomically and then ignored.
class ContentEngine::SectionImagesDoubleSpendTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  def setup
    @user = Core::User.create!(
      name: "Double Spend",
      email: "ds-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, locale: "es"
    )
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "programming", locale: "es", status: :active
    )
    @step = @route.route_steps.create!(
      title: "Paso", position: 0, status: :available, content_type: "lesson",
      delivery_format: "text", level: 1,
      metadata: {
        "parsed_sections" => [
          { "type" => "visual", "image_description" => "Una nube con tres dispositivos",
            "image_url" => nil }
        ],
        "content_ready" => true
      }
    )
    ContentEngine::AiContent.create!(
      route_step: @step, content_type: :text, ai_model: "test",
      body: "## Visual: Diagrama\nUna nube con tres dispositivos.\n"
    )
    post "/sign_in", params: { email: @user.email, password: "password123" }
  end

  # image_generate_controller.js:27 builds this path by hand; there is no helper.
  def generate_url(section_index) = "/content/section_images/#{@step.id}/#{section_index}/generate"

  test "a second generate for a section already generating does not enqueue a second paid job" do
    assert_enqueued_jobs 1, only: ContentEngine::SectionImageJob do
      post generate_url(0)
      assert_response :accepted
      post generate_url(0)
    end
  end

  test "the second generate still answers the poller truthfully" do
    post generate_url(0)
    assert_response :accepted

    post generate_url(0)
    assert_response :accepted
    body = JSON.parse(response.body)
    assert body["success"], "the click is not an error; the work is already in flight"
    assert_equal "generating", body["status"]
  end

  test "a generate for a DIFFERENT section is not blocked by the first claim" do
    parsed = @step.reload.metadata["parsed_sections"]
    parsed << { "type" => "visual", "image_description" => "Otro diagrama", "image_url" => nil }
    @step.merge_metadata!("parsed_sections" => parsed)

    assert_enqueued_jobs 2, only: ContentEngine::SectionImageJob do
      post generate_url(0)
      post generate_url(1)
    end
  end

  test "a failed section can be retried" do
    post generate_url(0)
    parsed = @step.reload.metadata["parsed_sections"]
    parsed[0]["image_status"] = "failed"
    @step.merge_metadata!("parsed_sections" => parsed)

    assert_enqueued_jobs 1, only: ContentEngine::SectionImageJob do
      post generate_url(0)
    end
  end
end
