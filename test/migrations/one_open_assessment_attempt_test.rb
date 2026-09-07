require "test_helper"
require Rails.root.join("db/migrate/20260907000001_one_open_assessment_attempt")

# The migration's `up` has two halves and only one of them was exercised by
# running it: adding the index is trivial, MERGING the rows the race already
# made is where a student's answers can be lost.
#
# Production may well have zero split attempts, in which case the merge never
# runs there either — which is exactly why it needs a test. The one time it does
# run, it runs on real answers, unattended, during a deploy.
#
# The index makes the state under test impossible, so the test drops it, builds
# the split, runs the merge, and puts the index back. `ensure` restores it even
# when an assertion fails; the schema must not be left changed for whatever runs
# next.
class OneOpenAssessmentAttemptTest < ActiveSupport::TestCase
  INDEX = OneOpenAssessmentAttempt::INDEX

  setup do
    @user = create_test_user(email_verified_at: Time.current)
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Split", locale: "en", status: :active
    )
    preview = LearningRoutesEngine::RouteModule.find_by!(
      learning_route_id: route.id, access_state: :preview
    )
    step = LearningRoutesEngine::RouteStep.create!(
      learning_route: route, route_module: preview, title: "Exam", position: 0,
      status: :available, content_type: :assessment, level: :nv1, bloom_level: 1
    )
    @assessment = Assessments::Assessment.create!(
      route_step: step, assessment_type: :level_up, passing_score: 70
    )
    @questions = 3.times.map do |i|
      Assessments::Question.create!(
        assessment: @assessment, body: "P#{i}", question_type: :multiple_choice,
        options: %w[si no], correct_answer: "si", difficulty: 1, bloom_level: 1
      )
    end
  end

  test "an answer to a question the keeper never answered survives the merge" do
    without_the_index do
      earlier = open_attempt(created_at: 2.minutes.ago)
      later   = open_attempt(created_at: 1.minute.ago)

      answer(earlier, @questions[0], "si")   # only the earlier attempt has this one
      answer(earlier, @questions[1], "si")   # both have it — one copy must go
      answer(later,   @questions[1], "no")
      answer(later,   @questions[2], "si")   # only the later attempt has this one

      merge!

      survivors = Assessments::AssessmentResult.where(assessment: @assessment, score: nil)
      assert_equal 1, survivors.count, "the split was not resolved"

      answered = Assessments::UserAnswer
        .where(assessment_result_id: survivors.first.id)
        .joins(:question).pluck("assessments_questions.body")
      assert_equal %w[P0 P1 P2], answered.sort,
        "a question the surviving attempt had no answer for lost the one it had"
    end
  end

  test "the duplicate answer dropped is the one the keeper already had" do
    without_the_index do
      earlier = open_attempt(created_at: 2.minutes.ago)
      later   = open_attempt(created_at: 1.minute.ago)
      answer(earlier, @questions[0], "si")
      answer(earlier, @questions[1], "si")
      answer(later,   @questions[1], "no")
      answer(later,   @questions[2], "si")

      merge!

      keeper = Assessments::AssessmentResult.where(assessment: @assessment, score: nil).first
      assert_equal later.id, keeper.id,
        "with the answer counts tied the most recent attempt is the keeper"
      assert_equal "no",
        Assessments::UserAnswer.find_by(assessment_result_id: keeper.id, question: @questions[1]).answer,
        "the keeper's own answer must win over the one moved across"
    end
  end

  test "answerless duplicates collapse to one" do
    without_the_index do
      3.times { |i| open_attempt(created_at: (3 - i).minutes.ago) }

      merge!

      assert_equal 1, Assessments::AssessmentResult.where(assessment: @assessment, score: nil).count
    end
  end

  # A retake is a scored attempt plus a new open one. The merge must not touch
  # history, or running the migration would silently delete a student's results.
  test "scored attempts are never merged or deleted" do
    without_the_index do
      Assessments::AssessmentResult.create!(user: @user, assessment: @assessment, score: 0)
      Assessments::AssessmentResult.create!(user: @user, assessment: @assessment, score: 40)
      open_attempt(created_at: 1.minute.ago)
      open_attempt(created_at: 30.seconds.ago)

      merge!

      scored = Assessments::AssessmentResult.where(assessment: @assessment).where.not(score: nil)
      assert_equal [0.0, 40.0], scored.order(:score).pluck(:score).map(&:to_f)
      assert_equal 1, Assessments::AssessmentResult.where(assessment: @assessment, score: nil).count
    end
  end

  test "a single open attempt is left alone" do
    without_the_index do
      only = open_attempt(created_at: 1.minute.ago)
      answer(only, @questions[0], "si")

      merge!

      assert_equal only.id,
        Assessments::AssessmentResult.where(assessment: @assessment, score: nil).sole.id
      assert_equal 1, Assessments::UserAnswer.where(assessment_result_id: only.id).count
    end
  end

  private

  def merge!
    OneOpenAssessmentAttempt.new.send(:merge_existing_duplicates!)
  end

  def open_attempt(created_at:)
    Assessments::AssessmentResult.create!(
      user: @user, assessment: @assessment, created_at: created_at
    )
  end

  def answer(result, question, value)
    Assessments::UserAnswer.create!(
      user: @user, question: question, assessment_result: result, answer: value
    )
  end

  # The index forbids the state the merge exists to clean up. Dropped for the
  # duration and always restored — a test must not leave the schema changed.
  def without_the_index
    connection = ActiveRecord::Base.connection
    connection.remove_index(:assessments_assessment_results, name: INDEX)
    yield
  ensure
    Assessments::UserAnswer.where(user_id: @user.id).delete_all
    Assessments::AssessmentResult.where(user_id: @user.id).delete_all
    unless connection.index_name_exists?(:assessments_assessment_results, INDEX)
      connection.add_index(:assessments_assessment_results, %i[user_id assessment_id],
                           unique: true, where: "score IS NULL", name: INDEX)
    end
  end
end
