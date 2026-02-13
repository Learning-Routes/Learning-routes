require "test_helper"

module Assessments
  class QuestionTest < ActiveSupport::TestCase
    test "requires body" do
      question = Question.new(body: nil)
      assert_not question.valid?
      assert_includes question.errors[:body], "can't be blank"
    end

    test "question_type enum values" do
      assert_equal(
        { "multiple_choice" => 0, "short_answer" => 1, "code" => 2, "practical" => 3 },
        Question.question_types
      )
    end

    test "bloom_label returns correct label" do
      question = Question.new(bloom_level: 3)
      assert_equal "Apply", question.bloom_label
    end

    test "difficulty must be between 1 and 5" do
      question = Question.new(difficulty: 6)
      assert_not question.valid?
    end

    test "bloom_level must be between 1 and 6" do
      question = Question.new(bloom_level: 7)
      assert_not question.valid?
    end
  end
end
