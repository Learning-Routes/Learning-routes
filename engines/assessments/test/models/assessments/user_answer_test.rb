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
      assessment = Assessment.create!(route_step: step, assessment_type: :diagnostic, passing_score: 70)
      @question = Question.create!(
        assessment: assessment, body: "2+2?", question_type: :multiple_choice,
        correct_answer: "4", options: %w[3 4 5]
      )
    end

    test "one answer per (user, question) — validation blocks a second" do
      UserAnswer.create!(user: @user, question: @question, answer: "4")
      dup = UserAnswer.new(user: @user, question: @question, answer: "3")
      assert_not dup.valid?
      assert dup.errors[:question_id].any?
    end

    test "DB unique index blocks a second answer even bypassing validation" do
      UserAnswer.create!(user: @user, question: @question, answer: "4")
      assert_raises(ActiveRecord::RecordNotUnique) do
        # Skip validations to prove the database itself enforces uniqueness
        # (this is what stops the concurrent-POST brute-force).
        UserAnswer.new(user: @user, question: @question, answer: "3").save!(validate: false)
      end
    end
  end
end
