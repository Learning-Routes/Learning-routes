# frozen_string_literal: true

require "test_helper"

module Assessments
  class UserAnswerTest < ActiveSupport::TestCase
    setup do
      @user = Core::User.create!(
        email: "ua-#{SecureRandom.hex(4)}@example.com",
        password: "password123", name: "UA", role: :student
      )
      profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
      route = LearningRoutesEngine::LearningRoute.create!(learning_profile: profile, topic: "T")
      step = LearningRoutesEngine::RouteStep.create!(learning_route: route, position: 0, title: "S")
      @assessment = Assessment.create!(route_step: step, assessment_type: :diagnostic, passing_score: 70)
      @question = Question.create!(
        assessment: @assessment, body: "2+2?", question_type: :multiple_choice,
        correct_answer: "4", options: %w[3 4 5]
      )
      # An answer now belongs to an ATTEMPT. WP-27 scoped it there so a retake
      # can differ from the first run; the anti-cheat guarantee is unchanged in
      # strength, only in scope.
      @attempt = AssessmentResult.create!(user: @user, assessment: @assessment)
    end

    test "one answer per (attempt, question) — validation blocks a second" do
      UserAnswer.create!(user: @user, question: @question, assessment_result: @attempt, answer: "4")
      dup = UserAnswer.new(user: @user, question: @question, assessment_result: @attempt, answer: "3")
      assert_not dup.valid?
      assert dup.errors[:question_id].any?
    end

    test "DB unique index blocks a second answer even bypassing validation" do
      UserAnswer.create!(user: @user, question: @question, assessment_result: @attempt, answer: "4")
      assert_raises(ActiveRecord::RecordNotUnique) do
        # Skip validations to prove the DATABASE enforces it — this is what stops
        # the concurrent-POST brute-force, where parallel requests (one per
        # option) each slip past find_by and create a separately-graded row.
        UserAnswer.new(user: @user, question: @question, assessment_result: @attempt, answer: "3")
                  .save!(validate: false)
      end
    end

    # The other half of the same property: the guard is scoped to the ATTEMPT, so
    # a second attempt may answer the same question again. Without this the
    # anti-cheat rule and the retake feature cannot both be true.
    test "a different attempt may answer the same question" do
      UserAnswer.create!(user: @user, question: @question, assessment_result: @attempt, answer: "3")
      retake = AssessmentResult.create!(user: @user, assessment: @assessment)

      second = UserAnswer.new(user: @user, question: @question, assessment_result: retake, answer: "4")

      assert second.valid?, second.errors.full_messages.to_sentence
      assert_nothing_raised { second.save! }
    end
  end
end
