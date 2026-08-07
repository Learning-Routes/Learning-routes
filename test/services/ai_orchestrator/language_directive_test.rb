require "test_helper"

# P1-5: fourteen of the seventeen prompt templates carried no {{language_directive}}
# token, and PromptBuilder applied the directive with gsub!, which is a no-op when the
# token is absent. So step_quiz, exam_questions, gap_analysis, quick_grading,
# exercise_hint and the rest received NO locale instruction and answered in whatever
# language they felt like — which is why a Spanish learner got Spanish lessons and
# English quizzes.
class AiOrchestrator::LanguageDirectiveTest < ActiveSupport::TestCase
  PROMPTS_DIR = Rails.root.join("engines/ai_orchestrator/config/prompts")

  def all_task_types
    Dir.children(PROMPTS_DIR).grep(/\.yml\z/).map { |f| File.basename(f, ".yml") }.sort
  end

  def build(task_type, locale:, target_locale: nil)
    AiOrchestrator::PromptBuilder.new(
      task_type: task_type,
      variables: { "locale" => locale, "target_locale" => target_locale }.compact
    ).build
  end

  test "every prompt template carries the language_directive token" do
    missing = all_task_types.reject do |task|
      YAML.load_file(PROMPTS_DIR.join("#{task}.yml"))
          .values_at("system_prompt", "user_prompt").compact.join.include?("{{language_directive}}")
    end

    assert_equal [], missing,
      "#{missing.inspect} carry no {{language_directive}} token. They still work — " \
      "PromptBuilder appends the directive as a fallback — but the token is where it " \
      "belongs in the prompt's own structure."
  end

  test "every template's built system prompt actually contains the Spanish directive" do
    # The assertion that matters: not "is the token present" but "did the instruction
    # reach the model". Covers both the substitution path and the append fallback.
    without = all_task_types.reject do |task|
      build(task, locale: "es")[:system].to_s.include?("Spanish")
    end

    assert_equal [], without,
      "#{without.inspect} produce a system prompt with no Spanish language instruction"
  end

  test "step_quiz specifically gets the Spanish directive" do
    # Named on its own: this is the template behind "Spanish lessons, English quizzes".
    system = build("step_quiz", locale: "es")[:system].to_s

    assert_includes system, "LANGUAGE MODE"
    assert_includes system, "Spanish"
    assert_not_includes system, "{{language_directive}}", "token left uninterpolated"
  end

  test "an English request does not ask for Spanish" do
    system = build("step_quiz", locale: "en")[:system].to_s

    assert_includes system, "LANGUAGE MODE"
    assert_includes system, "English"
  end

  test "a bilingual route gets the bilingual directive, not the monolingual one" do
    system = build("step_quiz", locale: "es", target_locale: "pt")[:system].to_s

    assert_includes system, "BILINGUAL"
  end

  test "no built prompt leaks an uninterpolated directive token" do
    leaking = all_task_types.select do |task|
      prompts = build(task, locale: "es")
      "#{prompts[:system]}#{prompts[:user]}".include?("{{language_directive}}")
    end

    assert_equal [], leaking
  end

  test "the fallback appends the directive when a template lacks the token" do
    # Simulate a template added later without the token: PromptBuilder must still get
    # the instruction in front of the model rather than silently regressing.
    builder = AiOrchestrator::PromptBuilder.new(
      task_type: "definitely_not_a_real_template", variables: { "locale" => "es" }
    )

    system = builder.build[:system].to_s

    assert_includes system, "Spanish",
      "a template with no token must still receive the directive via the append fallback"
  end

  test "the directive is not appended twice when the token is present" do
    # Count the full directive text, not the phrase "LANGUAGE MODE" — lesson_content.yml
    # legitimately cross-references it in prose ("Write explanations per LANGUAGE MODE",
    # "Labels must follow the LANGUAGE MODE"), so counting the phrase over-counts.
    directive = AiOrchestrator::LanguageInstructions.directive(content_locale: "es", target_locale: nil)
    system = build("lesson_content", locale: "es")[:system].to_s

    assert_equal 1, system.scan(Regexp.new(Regexp.escape(directive))).size,
      "directive appears more than once — substitution and append both fired"
  end
end
