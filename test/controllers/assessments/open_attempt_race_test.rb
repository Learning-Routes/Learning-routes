require "test_helper"

# WP-32 §4 — two concurrent starts split one exam across two attempts.
#
# `assessments#start` did `find_by(user:, assessment:, score: nil)` and then
# `create!`, with nothing in the database to stop the second insert. `take` then
# picked an UNORDERED `find_by` while `answers#create` picked
# `.order(:created_at).last`, so the two could disagree about which attempt the
# student was in: answers landed on one row, `submit` scored the other, and the
# student got 0% and a failed attempt recorded for an exam they had answered.
#
# The invariant is "a student has at most one open attempt at an assessment",
# and an invariant belongs in the database. Transactional tests share one
# uncommitted transaction, so two threads inside them never race — this class
# turns them off and takes real connections, the same pattern as the other
# concurrency tests here.
module Assessments
  class OpenAttemptRaceTest < ActiveSupport::TestCase
    self.use_transactional_tests = false

    EMAIL_PATTERN = "open-attempt-race-%"

    setup do
      delete_race_records
      @user = Core::User.create!(
        name: "Racer", email: "open-attempt-race-#{SecureRandom.hex(4)}@example.test",
        password: "password123", password_confirmation: "password123",
        email_verified_at: Time.current
      )
      profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoutesEngine::LearningRoute.create!(
        learning_profile: profile, topic: "Race", locale: "en"
      )
      preview = LearningRoutesEngine::RouteModule.find_by!(
        learning_route_id: @route.id, access_state: :preview
      )
      @step = @route.route_steps.create!(
        route_module: preview, title: "Exam", position: 0, status: :available,
        content_type: :assessment, level: :nv1, bloom_level: 1
      )
      @assessment = Assessment.create!(
        route_step: @step, assessment_type: :level_up, passing_score: 70
      )
    end

    teardown do
      delete_race_records
    end

    # Deterministic, no threads: the guarantee itself.
    test "the database refuses a second open attempt" do
      AssessmentResult.create!(user: @user, assessment: @assessment)

      assert_raises ActiveRecord::RecordNotUnique,
        "nothing in the database stopped an exam being split across two attempts" do
        AssessmentResult.insert!(
          { user_id: @user.id, assessment_id: @assessment.id, score: nil, passed: false,
            created_at: Time.current, updated_at: Time.current }
        )
      end
    end

    # A SCORED attempt is history and must never be blocked by the guard — a
    # retake would be impossible.
    test "scored attempts are not covered by the guard" do
      3.times { AssessmentResult.create!(user: @user, assessment: @assessment, score: 0) }

      assert_equal 3, AssessmentResult.where(user: @user, assessment: @assessment).count
      assert_nothing_raised { AssessmentResult.create!(user: @user, assessment: @assessment) }
    end

    test "two simultaneous starts leave one open attempt and neither caller fails" do
      ready = Queue.new
      release = Queue.new
      outcomes = Queue.new

      threads = 2.times.map do
        Thread.new do
          ActiveRecord::Base.connection_pool.with_connection do
            ready << true
            release.pop
            begin
              outcomes << AssessmentResult.open_attempt_for!(user: @user, assessment: @assessment).id
            rescue StandardError => error
              outcomes << error
            end
          end
        end
      end

      2.times { ready.pop }
      2.times { release << true }
      threads.each { |thread| assert thread.join(10), "a start thread did not finish" }
      results = 2.times.map { outcomes.pop }

      assert_equal [], results.grep(StandardError),
        "a concurrent start raised instead of joining the attempt that won"
      assert_equal 1, results.uniq.size, "the two callers ended up in different attempts"
      assert_equal 1,
        AssessmentResult.where(user: @user, assessment: @assessment, score: nil).count,
        "two open attempts: answers land on one and submit scores the other"
    ensure
      2.times { release << true } if release
      threads&.each { |thread| thread.join(5) }
    end

    # `take` used an unordered find_by while `answers#create` ordered by
    # created_at. With one open attempt guaranteed they cannot disagree, but the
    # lookup is shared so a future second row could not reintroduce the split.
    test "the open attempt lookup is the same row for every caller" do
      AssessmentResult.create!(user: @user, assessment: @assessment, score: 0)
      open_attempt = AssessmentResult.create!(user: @user, assessment: @assessment)

      assert_equal open_attempt.id,
        AssessmentResult.open_attempt_for(user: @user, assessment: @assessment)&.id
    end

    private

    def delete_race_records
      users = Core::User.where("email LIKE ?", EMAIL_PATTERN)
      profiles = LearningRoutesEngine::LearningProfile.where(user_id: users.select(:id))
      routes = LearningRoutesEngine::LearningRoute.where(learning_profile_id: profiles.select(:id))
      steps = LearningRoutesEngine::RouteStep.where(learning_route_id: routes.select(:id))
      assessments = Assessment.where(route_step_id: steps.select(:id))
      results = AssessmentResult.where(assessment_id: assessments.select(:id))
      UserAnswer.where(assessment_result_id: results.select(:id)).delete_all
      results.delete_all
      Question.where(assessment_id: assessments.select(:id)).delete_all
      assessments.delete_all
      steps.delete_all
      routes.delete_all
      profiles.delete_all
      users.delete_all
    end
  end
end
