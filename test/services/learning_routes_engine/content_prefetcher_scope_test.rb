require "test_helper"

# ContentPrefetcher has no user, so it cannot ask `generation_allowed?`. Its
# `access_state: :preview` filter is therefore the only thing standing between a
# refunded route and prefetched paid lessons, two at a time, at ~2.33¢ each.
#
# Task 8 must widen that filter to reach `purchased` modules. This test exists so
# that widening it WITHOUT bringing an entitlement check along fails loudly here
# rather than silently on a customer's refunded route.
class LearningRoutesEngine::ContentPrefetcherScopeTest < ActiveSupport::TestCase
  # ActiveSupport::TestCase does not include the ActiveJob assertions by default.
  include ActiveJob::TestHelper

  Prefetcher = LearningRoutesEngine::ContentPrefetcher

  def setup
    @user = create_test_user(email_verified_at: Time.current)
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Prefetch scope", locale: "en", status: :active
    )
    @preview_module = LearningRoutesEngine::RouteModule.find_by!(
      learning_route_id: @route.id, access_state: :preview
    )
    @preview_step = @route.route_steps.create!(
      route_module: @preview_module, position: 1, title: "Free", status: :available,
      content_type: :lesson
    )
  end

  test "a purchased module's steps are never offered for prefetch" do
    paid_step = step_in(access_state: :purchased, position: 2)

    assert_includes Prefetcher.pending_step_ids(@route), @preview_step.id
    assert_not_includes Prefetcher.pending_step_ids(@route), paid_step.id,
      "widening the preview filter needs an entitlement check — see the comment in ContentPrefetcher"
  end

  test "a locked module's steps are never offered for prefetch" do
    locked_step = step_in(access_state: :locked, position: 3)

    assert_not_includes Prefetcher.pending_step_ids(@route), locked_step.id
  end

  test "claim refuses a purchased step even when it is named directly" do
    paid_step = step_in(access_state: :purchased, position: 2)

    assert_empty Prefetcher.claim([paid_step.id], access_states: Prefetcher::PREVIEW_ONLY)
    assert_nil paid_step.reload.metadata&.dig("content_generating")
  end

  test "claim still works for the free preview" do
    assert_equal [@preview_step.id],
                 Prefetcher.claim([@preview_step.id], access_states: Prefetcher::PREVIEW_ONLY)
  end

  test "prefetch enqueues nothing for a purchased step" do
    paid_step = step_in(access_state: :purchased, position: 2)

    assert_no_enqueued_jobs(only: LearningRoutesEngine::ContentPipelineJob) do
      Prefetcher.prefetch(@route, [paid_step.id])
    end
  end

  private

  def step_in(access_state:, position:)
    mod = @route.route_modules.create!(
      position: position, title: "Module #{position}",
      access_state: access_state, generation_state: :ready
    )
    @route.route_steps.create!(
      route_module: mod, position: position, title: "Step #{position}",
      status: :available, content_type: :lesson
    )
  end
end
