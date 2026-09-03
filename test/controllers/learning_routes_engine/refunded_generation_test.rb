require "test_helper"

# The other half of the read/spend split.
#
# `ae62268` wired `generation_allowed?` into tutor chat, voice responses and the
# three content_engine `generate` endpoints. StepsController was missed, and it
# is the single largest paid call in the system: `lesson_content`. Every enqueue
# in that controller rode on `authorize_module_access!`, which resolves through
# `RoutePurchase.entitled?` and counts `refunded` BY DESIGN — the approved spec
# defers post-refund read revocation.
#
# So reads must keep working after a refund, and spending must stop. Both halves
# are asserted here.
class LearningRoutesEngine::RefundedGenerationTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  def setup
    @user = create_test_user(email_verified_at: Time.current)
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Refund policy", locale: "en", status: :active
    )
    @preview_module = LearningRoutesEngine::RouteModule.find_by!(
      learning_route_id: @route.id, access_state: :preview
    )
    # A module in the state a purchase leaves behind: OrderProcessor#apply! moves
    # `locked` to `purchased`, and `mark_refunded!` does not move it back.
    @paid_module = @route.route_modules.create!(
      position: 2, title: "Paid", access_state: :purchased, generation_state: :ready
    )
    @preview_step = @route.route_steps.create!(
      route_module: @preview_module, position: 1, title: "Free lesson",
      status: :available, content_type: :lesson
    )
    @paid_step = @route.route_steps.create!(
      route_module: @paid_module, position: 2, title: "Paid lesson",
      status: :available, content_type: :lesson
    )
    sign_in_as(@user)
  end

  # ── reads survive the refund ────────────────────────────────────────────

  test "a refunded route still renders a paid step whose content already exists" do
    refund!
    ContentEngine::AiContent.create!(
      route_step: @paid_step, content_type: :text, body: "ALREADY-GENERATED-BODY"
    )

    get learning_routes_engine.route_step_path(@route, @paid_step)

    assert_response :success
    assert_includes response.body, "ALREADY-GENERATED-BODY",
      "a refund must not revoke access to content that already exists"
  end

  # ── spending stops ──────────────────────────────────────────────────────

  test "a refunded route enqueues no content pipeline on the lesson path" do
    refund!

    assert_no_enqueued_jobs(only: LearningRoutesEngine::ContentPipelineJob) do
      get learning_routes_engine.route_step_path(@route, @paid_step)
    end

    assert_response :success
    assert_select "[data-content-poll-url-value]", { count: 0 },
      "an unauthorized step must not poll a decision that will never change"
  end

  test "a refunded route enqueues no content pipeline or audio job on the audio path" do
    refund!
    @paid_step.update!(delivery_format: "audio")

    assert_no_enqueued_jobs(only: [LearningRoutesEngine::ContentPipelineJob,
                                   ContentEngine::AudioGenerationJob]) do
      get learning_routes_engine.route_step_path(@route, @paid_step)
    end

    assert_response :success
  end

  test "a refunded route enqueues nothing from the turbo polling endpoint either" do
    refund!

    assert_no_enqueued_jobs(only: LearningRoutesEngine::ContentPipelineJob) do
      get learning_routes_engine.content_status_route_step_path(@route, @paid_step)
    end

    assert_response :success
  end

  test "a refunded route enqueues no assessment generation" do
    refund!
    @paid_step.update!(content_type: :assessment)

    assert_no_enqueued_jobs(only: LearningRoutesEngine::AssessmentGenerationJob) do
      get learning_routes_engine.route_step_path(@route, @paid_step)
    end

    assert_response :success
  end

  # The prefetch path is deliberately NOT gated on the step being viewed:
  # `pending_step_ids` returns preview-module steps only, so it prefetches free
  # content, and blocking that would stop a refunded student warming the free
  # preview — which the policy explicitly protects. The spend boundary for
  # prefetch lives in ContentPrefetcher's preview filter; see
  # content_prefetcher_scope_test.rb.
  test "a refunded route still prefetches the FREE steps ahead" do
    refund!
    @route.route_steps.create!(
      route_module: @preview_module, position: 3, title: "Ahead",
      status: :available, content_type: :lesson
    )

    assert_enqueued_with(job: LearningRoutesEngine::ContentPipelineJob) do
      get learning_routes_engine.route_step_path(@route, @paid_step)
    end
  end

  test "a refunded route enqueues no step quiz on completion" do
    refund!

    assert_no_enqueued_jobs(only: LearningRoutesEngine::StepQuizGenerationJob) do
      post learning_routes_engine.complete_route_step_path(@route, @paid_step), as: :json
    end
  end

  # Found by sweeping every paid enqueue rather than trusting the docstring's
  # list. `Assessments::ResultsController` authorizes on RESULT OWNERSHIP alone,
  # which stays true after a refund, and GapAnalyzer plus ReinforcementGenerator
  # are two paid Orchestrate calls per submit.
  test "a refunded route enqueues no gap analysis when an assessment is submitted" do
    refund!
    assessment = Assessments::Assessment.create!(
      route_step: @paid_step, assessment_type: :step_quiz, passing_score: 70
    )
    result = Assessments::AssessmentResult.create!(user: @user, assessment: assessment)

    assert_no_enqueued_jobs(only: LearningRoutesEngine::GapAnalysisJob) do
      post assessments.submit_result_path(result), as: :json
    end
  end

  # ── the free preview is unaffected for everyone ─────────────────────────

  test "the free preview still generates for a user with no purchase at all" do
    assert_equal 0, Commerce::RoutePurchase.count

    assert_enqueued_with(job: LearningRoutesEngine::ContentPipelineJob) do
      get learning_routes_engine.route_step_path(@route, @preview_step)
    end

    assert_response :success
  end

  test "the free preview still generates on a refunded route" do
    refund!

    assert_enqueued_with(job: LearningRoutesEngine::ContentPipelineJob) do
      get learning_routes_engine.route_step_path(@route, @preview_step)
    end
  end

  # A paid, unrefunded purchase must keep its authority — this is the state
  # Task 8 will build on, and the guard must not block it.
  test "a paid purchase authorizes generation on the paid module" do
    pay!

    assert LearningRoutesEngine::ModuleAccessPolicy.generation_allowed?(
      user: @user, route_id: @route.id, step_id: @paid_step.id
    )
  end

  private

  def pay!
    quote = Commerce::RouteQuote.create_snapshot!(
      user: @user, learning_route: @route, currency: "USD",
      total_module_count: 2, paid_module_count: 1,
      estimated_ai_cost_microcents: 1_000_000, estimated_fee_cents: 40,
      markup_basis_points: Commerce::PricingConstants::MARKUP_BASIS_POINTS,
      minimum_price_per_paid_module_cents: Commerce::PricingConstants::MINIMUM_PRICE_PER_PAID_MODULE_CENTS,
      cost_based_price_cents: 210, minimum_price_cents: 299, final_price_cents: 299,
      estimator_version: "v1", provider_rate_versions: { "m" => "1" }, fee_version: "f1",
      image_quality: "medium", route_shape_assumptions: { "outline" => [] },
      provider_rate_assumptions: { "m" => {} }, fee_assumptions: { "version" => "f1" },
      expires_at: 24.hours.from_now
    )
    purchase = Commerce::RoutePurchase.create!(
      user: @user, learning_route: @route, route_quote: quote, state: "pending",
      provider: "lemon_squeezy", test_mode: true, amount_cents: 299, currency: "USD",
      estimated_ai_cost_microcents: 1_000_000, estimated_fee_cents: 40
    )
    purchase.mark_paid!(order_id: "ord_#{SecureRandom.hex(3)}", actual_fee_cents: 45,
                        paid_at: Time.current)
    purchase
  end

  def refund!
    pay!.tap { |p| p.mark_refunded!(refunded_amount_cents: 299, refunded_at: Time.current) }
  end
end
