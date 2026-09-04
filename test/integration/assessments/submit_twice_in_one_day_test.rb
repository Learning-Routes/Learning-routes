require "test_helper"

# TWO CLASSES.
#
# A. "The second submit of the day works."
#    `ProgressSnapshot.take_snapshot!` uses `create_or_find_by!`, which works by
#    attempting `create!` and rescuing `ActiveRecord::RecordNotUnique` — the
#    DATABASE's error, from `idx_progress_snapshots_unique`. But the model also
#    declared `validates :snapshot_date, uniqueness: ...`, and a validation runs
#    BEFORE the INSERT. So `create!` raised `RecordInvalid`, which
#    `create_or_find_by!` does not rescue, and the request 422'd. The validation
#    defeated the exact mechanism the method depends on.
#
# B. "A failed submit does not spend."
#    `submit` performs seven side effects AFTER the score has already committed,
#    with no transaction. The paid GapAnalysisJob was step 4 of 6, so every
#    failure at step 6 had already enqueued it — and the student, shown nothing,
#    started the exam again.
module Assessments
  class SubmitTwiceInOneDayTest < ActionDispatch::IntegrationTest
    def setup
      @user = create_test_user(email_verified_at: Time.current, locale: "es")
      profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoutesEngine::LearningRoute.create!(
        learning_profile: profile, topic: "Portugués", locale: "es", status: :active
      )
      @preview = LearningRoutesEngine::RouteModule.find_by!(
        learning_route_id: @route.id, access_state: :preview
      )
      post core.sign_in_path, params: { email: @user.email, password: "password123" }
    end

    # ── A ───────────────────────────────────────────────────────────────────

    test "a second assessment on the same route submits on the same day" do
      first = assessment_at(position: 0)
      second = assessment_at(position: 1)

      submit_fully(first)
      assert_response :redirect, "the first submit of the day must work"

      submit_fully(second)

      assert_response :redirect,
        "the second submit of the day 422'd: take_snapshot! uses create_or_find_by!, " \
        "which rescues RecordNotUnique, but the model validation raised RecordInvalid first"
      assert_not_nil result_for(first).score
      assert_not_nil result_for(second).score
    end

    test "one snapshot per route per day, and the second submit reuses it" do
      first = assessment_at(position: 0)
      second = assessment_at(position: 1)

      submit_fully(first)
      submit_fully(second)

      assert_equal 1,
        Analytics::ProgressSnapshot.where(
          user: @user, learning_route: @route, snapshot_date: Date.current
        ).count,
        "the database index is the guard, and it must still hold"
    end

    # ── B: the class ────────────────────────────────────────────────────────

    test "a failure in bookkeeping does not enqueue the paid job" do
      assessment = assessment_at(position: 0)
      answer_everything(assessment)

      with_failing_snapshot do
        assert_no_enqueued_jobs(only: LearningRoutesEngine::GapAnalysisJob) do
          post assessments.submit_result_path(result_for(assessment))
        end
      end

      assert_response :redirect,
        "the score is committed by then; a bookkeeping failure must still hand the " \
        "student their result rather than 422 with an exception body"
    end

    test "the paid job is enqueued at most once per attempt" do
      assessment = assessment_at(position: 0)
      answer_everything(assessment)
      result = result_for(assessment)

      assert_enqueued_jobs 1, only: LearningRoutesEngine::GapAnalysisJob do
        post assessments.submit_result_path(result)
      end

      # Re-submitting the same attempt must not buy a second analysis.
      assert_no_enqueued_jobs(only: LearningRoutesEngine::GapAnalysisJob) do
        3.times { post assessments.submit_result_path(result) }
      end
    end

    test "re-submitting writes no duplicate learning metric" do
      assessment = assessment_at(position: 0)
      answer_everything(assessment)
      result = result_for(assessment)

      post assessments.submit_result_path(result)
      before = Analytics::LearningMetric.where(user: @user).count

      3.times { post assessments.submit_result_path(result) }

      assert_equal before, Analytics::LearningMetric.where(user: @user).count,
        "LearningMetric.record! is a bare create! with no uniqueness scope"
    end

    # A submit that fails its bookkeeping must still be able to buy the analysis
    # later — the claim is on the RESULT, not on the request, so the retry
    # completes what the failure skipped instead of skipping it forever.
    test "a retry after a failed submit still enqueues the paid job once" do
      assessment = assessment_at(position: 0)
      answer_everything(assessment)
      result = result_for(assessment)

      with_failing_snapshot do
        post assessments.submit_result_path(result)
      end
      assert_nil result.reload.gap_analysis_enqueued_at

      assert_enqueued_jobs 1, only: LearningRoutesEngine::GapAnalysisJob do
        post assessments.submit_result_path(result)
      end
      assert_not_nil result.reload.gap_analysis_enqueued_at
    end

    private

    def assessment_at(position:)
      step = @route.route_steps.create!(
        route_module: @preview, title: "Examen #{position}", position: position,
        status: :available, content_type: :assessment, level: :nv1, bloom_level: 1
      )
      assessment = Assessment.create!(
        route_step: step, assessment_type: :level_up, passing_score: 70
      )
      Question.create!(
        assessment: assessment, body: "Pregunta #{position}", question_type: :multiple_choice,
        options: %w[si no], correct_answer: "si", difficulty: 1, bloom_level: 1
      )
      assessment
    end

    def answer_everything(assessment, value: "si")
      post assessments.start_assessment_path(assessment)
      # Explicit query, not the association: the record was created in this test
      # and `strict_loading_by_default` refuses a lazy traversal.
      Question.where(assessment_id: assessment.id).order(:created_at).each do |question|
        post assessments.assessment_answers_path(assessment),
             params: { question_id: question.id, answer: value }
      end
    end

    def submit_fully(assessment)
      answer_everything(assessment)
      post assessments.submit_result_path(result_for(assessment))
    end

    def result_for(assessment)
      AssessmentResult.where(user: @user, assessment: assessment).order(:created_at).last
    end

    # `minitest/mock` is unavailable here; swap the singleton and restore it.
    def with_failing_snapshot
      original = Analytics::ProgressSnapshot.method(:take_snapshot!)
      Analytics::ProgressSnapshot.define_singleton_method(:take_snapshot!) do |**|
        raise ActiveRecord::RecordInvalid.new(Analytics::ProgressSnapshot.new)
      end
      yield
    ensure
      Analytics::ProgressSnapshot.define_singleton_method(:take_snapshot!, original)
    end
  end
end
