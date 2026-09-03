require "test_helper"

module LearningRoutesEngine
  # THE CLASS: no caller can create a billable step into the FREE module by
  # omission.
  #
  # The specific defect was `AdaptiveDifficulty#insert_reinforcement!` calling
  # `route_steps.create!` with no `route_module:`, so `assign_preview_module`
  # dropped reinforcement steps into the preview module — which is exactly the
  # filter ContentPrefetcher uses to decide what to generate for free. It runs on
  # every submission scoring under 60, with no ceiling, because
  # AssessmentsController#start mints a fresh result whenever the previous one
  # has a score. A genuinely struggling student who retries does this unaided.
  #
  # Fixing that one call site would leave the next one free to repeat it, so the
  # general case is asserted too: on a route that HAS paid modules, omitting the
  # module is a caller bug that raises.
  class ReinforcementModuleInheritanceTest < ActiveSupport::TestCase
    def setup
      @user = create_test_user(email_verified_at: Time.current)
      profile = LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoute.create!(learning_profile: profile, topic: "Refuerzo", locale: "en")
      @preview = RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
      @paid = @route.route_modules.create!(position: 2, title: "Paid", access_state: :locked)

      @free_step = RouteStep.create!(
        learning_route: @route, route_module: @preview, position: 1,
        title: "Free lesson", content_type: :lesson, status: :completed, level: :nv1
      )
      @paid_step = RouteStep.create!(
        learning_route: @route, route_module: @paid, position: 2,
        title: "Paid lesson", content_type: :lesson, status: :completed, level: :nv1
      )
    end

    # ── the specific case ───────────────────────────────────────────────────

    test "a reinforcement triggered from a PAID step is not free content" do
      reinforce_from(@paid_step)

      inserted = reinforcement_steps
      assert inserted.any?, "a score under 60 must still insert reinforcement"
      assert inserted.all? { |step| step.route_module_id == @paid.id },
        "reinforcement inherits the module of the step that triggered it"
      assert_empty ContentPrefetcher.pending_step_ids(@route) & inserted.map(&:id),
        "paid reinforcement must not be offered to the free prefetch path"
    end

    test "a reinforcement triggered from a FREE step stays free" do
      reinforce_from(@free_step)

      inserted = reinforcement_steps
      assert inserted.any?
      assert inserted.all? { |step| step.route_module_id == @preview.id }
    end

    # The module is inherited, not its access state, so a module that changes
    # state later carries its reinforcement with it.
    test "reinforcement follows the module when the module's access state changes" do
      reinforce_from(@paid_step)
      @paid.update!(access_state: :purchased)

      assert reinforcement_steps.all? { |step| step.route_module_id == @paid.id }
    end

    # A result that names no assessment (the service accepts a duck) falls back
    # to the module of the step the student is on — still a module derived from a
    # real step, never the free module chosen by omission.
    test "a result that names no assessment inherits the current step's module" do
      @route.update!(current_step: @paid_step.position)

      AdaptiveDifficulty.new(@route, Struct.new(:score).new(10.0)).adjust!

      inserted = reinforcement_steps
      assert inserted.any?
      assert inserted.all? { |step| step.route_module_id == @paid.id }
    end

    # Fails CLOSED when no step can be resolved at all: creating the steps anyway
    # would drop them into the free module, which is the whole defect.
    test "a route with no resolvable step inserts nothing rather than free content" do
      empty = LearningRoute.create!(
        learning_profile: LearningProfile.create!(user: create_test_user, current_level: "beginner"),
        topic: "No steps", locale: "en"
      )

      AdaptiveDifficulty.new(empty, Struct.new(:score).new(10.0)).adjust!

      assert_equal 0, RouteStep.where(learning_route_id: empty.id).count
    end

    # Confirmed by reading it rather than assumed by symmetry: the mirror branch
    # updates existing steps to completed and creates none.
    test "the high-score branch creates no steps at all" do
      before = RouteStep.where(learning_route_id: @route.id).count

      AdaptiveDifficulty.new(@route, result_for(@paid_step, score: 95.0)).adjust!

      assert_equal before, RouteStep.where(learning_route_id: @route.id).count
    end

    # ── the general case: the class ─────────────────────────────────────────

    test "creating a step with no module on a monetised route is a caller bug" do
      error = assert_raises(RouteStep::ImplicitPreviewModule) do
        @route.route_steps.create!(position: 9, title: "Forgot the module", content_type: :lesson)
      end

      assert_match(/route_module/, error.message)
    end

    test "the default still works on a route that has only the preview module" do
      solo = LearningRoute.create!(
        learning_profile: LearningProfile.create!(user: create_test_user, current_level: "beginner"),
        topic: "Single module", locale: "en"
      )
      preview = RouteModule.find_by!(learning_route_id: solo.id, access_state: :preview)

      step = solo.route_steps.create!(position: 1, title: "Fine", content_type: :lesson)

      assert_equal preview.id, step.route_module_id,
        "one possible answer is not an ambiguity; do not make single-module routes noisy"
    end

    private

    def reinforcement_steps
      RouteStep.where(learning_route_id: @route.id)
               .where("metadata->>'reinforcement' = 'true'")
               .order(:position)
               .to_a
    end

    def reinforce_from(step, score: 20.0)
      AdaptiveDifficulty.new(@route, result_for(step, score: score)).adjust!
    end

    def result_for(step, score:)
      assessment = Assessments::Assessment.create!(
        route_step: step, assessment_type: :level_up, passing_score: 70
      )
      Assessments::AssessmentResult.create!(user: @user, assessment: assessment, score: score)
    end
  end
end
