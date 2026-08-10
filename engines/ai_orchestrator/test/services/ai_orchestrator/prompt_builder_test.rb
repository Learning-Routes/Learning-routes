require "test_helper"

module AiOrchestrator
  class PromptBuilderTest < ActiveSupport::TestCase
    # NOTE: every case here passes `locale:`. Since WP-9, PromptBuilder raises when a
    # caller omits it — an omitted locale used to make the prompt instruct the model to
    # write in English, which is how a Spanish learner ended up with English quizzes.
    # These tests are about interpolation and template loading, so the locale is just
    # scaffolding.
    test "builds prompt with default template for unknown task" do
      builder = PromptBuilder.new(task_type: :nonexistent_task, variables: { prompt: "Hello", locale: "en" })
      result = builder.build

      assert result[:system].present?
      assert_match(/AI learning assistant/, result[:system])
      assert_equal "Hello", result[:user]
    end

    test "interpolates variables in prompt" do
      builder = PromptBuilder.new(
        task_type: :assessment_questions,
        variables: { topic: "Ruby", question_count: "5", locale: "en" }
      )
      result = builder.build

      assert_match(/Ruby/, result[:user])
      assert_match(/5/, result[:user])
    end

    test "removes unresolved placeholders" do
      builder = PromptBuilder.new(
        task_type: :assessment_questions,
        variables: { topic: "Ruby", locale: "en" }
      )
      result = builder.build

      assert_no_match(/\{\{/, result[:system])
      assert_no_match(/\}\}/, result[:system])
    end

    test "builds messages array" do
      builder = PromptBuilder.new(
        task_type: :quick_grading,
        variables: { question: "What is 2+2?", student_answer: "4", expected_answer: "4", locale: "en" }
      )
      messages = builder.build_messages

      assert messages.is_a?(Array)
      assert_equal "system", messages.first[:role]
      assert_equal "user", messages.last[:role]
    end

    test "loads YAML template for assessment_questions" do
      builder = PromptBuilder.new(
        task_type: :assessment_questions,
        variables: { topic: "Python", question_count: "10", locale: "en" }
      )
      result = builder.build

      assert_match(/assessment/i, result[:system])
      assert_match(/Python/, result[:user])
      assert_match(/10/, result[:user])
    end

    test "loads YAML template for route_generation" do
      builder = PromptBuilder.new(
        task_type: :route_generation,
        variables: { topic: "Machine Learning", goal: "become proficient", timeline: "3 months", locale: "en" }
      )
      result = builder.build

      assert_match(/curriculum/i, result[:system])
      assert_match(/Machine Learning/, result[:user])
    end

    test "loads YAML template for code_generation" do
      builder = PromptBuilder.new(
        task_type: :code_generation,
        variables: { language: "Ruby", description: "fibonacci function", locale: "en" }
      )
      result = builder.build

      assert_match(/Ruby/, result[:user])
      assert_match(/fibonacci/, result[:user])
    end

    test "handles string keys in variables" do
      builder = PromptBuilder.new(
        task_type: :quick_grading,
        variables: { "question" => "test?", "student_answer" => "yes", locale: "en" }
      )
      result = builder.build

      assert result[:user].present?
    end
  end
end
