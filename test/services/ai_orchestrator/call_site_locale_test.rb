require "test_helper"

# The test WP-6 should have had.
#
# language_directive_test.rb asserts that PromptBuilder produces a Spanish directive
# WHEN HANDED A SPANISH LOCALE. It passed the whole time production was broken, because
# it never exercises a caller — and the bug was that eight callers never passed a locale
# at all. A missing locale is not inert: LanguageInstructions.language_name(nil) falls
# through to "English", so the prompt confidently instructed the model to
# "Write the ENTIRE lesson in English".
#
# So these tests drive the real jobs/services/controllers against a Spanish route with a
# stubbed model, capture the OUTGOING SYSTEM PROMPT, and assert on it.
class AiOrchestrator::CallSiteLocaleTest < ActiveSupport::TestCase
  ENGLISH_DIRECTIVE = "Write the ENTIRE lesson in English"

  # Captures every system prompt AiClient is asked to send, and returns canned JSON so
  # the caller's own parsing succeeds.
  class PromptSpy
    attr_reader :system_prompts, :user_prompts

    def initialize(response)
      @system_prompts = []
      @user_prompts = []
      @response = response
    end

    def install(&blk)
      spy = self
      response = @response
      original = AiOrchestrator::AiClient.instance_method(:chat)

      AiOrchestrator::AiClient.define_method(:chat) do |prompt:, system_prompt: nil, params: {}|
        spy.system_prompts << system_prompt.to_s
        spy.user_prompts << prompt.to_s
        { content: response, model: "gpt-4.1-mini", input_tokens: 1, output_tokens: 1, latency_ms: 1 }
      end

      blk.call
    ensure
      AiOrchestrator::AiClient.define_method(:chat, original)
    end
  end

  def setup
    @user = Core::User.create!(
      name: "Locale Test", email: "loc-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, locale: "es"
    )
    @profile = LearningRoutesEngine::LearningProfile.create!(
      user: @user, current_level: "beginner", learning_style: ["visual"]
    )
    # A Spanish-taught course. This is the case that was broken.
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "Portugués", locale: "es", status: :active
    )
    @step = @route.route_steps.create!(
      title: "Saludos básicos", description: "Aprender saludos", position: 0,
      status: :available, content_type: "lesson", delivery_format: "text",
      level: 1, bloom_level: 1
    )
  end

  def assert_spanish_directive(prompts, label)
    assert prompts.any?, "#{label}: no prompt was sent — the spy captured nothing"

    prompts.each do |p|
      assert_not_includes p, ENGLISH_DIRECTIVE,
        "#{label}: the prompt explicitly asks the model to write in English for a Spanish route"
      assert_includes p, "LANGUAGE MODE", "#{label}: no language directive at all"
      assert_includes p, "Spanish", "#{label}: the directive does not name Spanish"
    end
  end

  # ── The reported symptom ────────────────────────────────────────────────

  test "step_quiz generation asks for Spanish" do
    quiz = { "questions" => [{ "question" => "¿Cómo se dice hola?", "options" => %w[a b c d],
                               "correct_answer" => "A", "explanation" => "porque sí" }] }
    spy = PromptSpy.new(quiz.to_json)

    spy.install do
      LearningRoutesEngine::StepQuizGenerationJob.new.perform(@step.id)
    end

    assert_spanish_directive(spy.system_prompts, "step_quiz")
  end

  test "exam question generation asks for Spanish" do
    exam = { "questions" => [{ "question" => "¿Qué es esto?", "type" => "multiple_choice",
                               "options" => %w[a b c d], "correct_answer" => "A", "points" => 1 }] }
    spy = PromptSpy.new(exam.to_json)
    @step.update!(content_type: "assessment", metadata: { "assessment_type" => "quiz" })

    spy.install { LearningRoutesEngine::AssessmentGenerationJob.new.perform(@step.id) }

    assert_spanish_directive(spy.system_prompts, "exam_questions")
  end

  test "gap analysis asks for Spanish" do
    spy = PromptSpy.new({ "gaps" => [{ "topic" => "t", "severity" => "low", "description" => "d" }] }.to_json)

    spy.install do
      LearningRoutesEngine::GapAnalyzer.new(route: @route, user_feedback: "no entiendo").analyze!
    end

    assert_spanish_directive(spy.system_prompts, "gap_analysis")
  end

  test "reinforcement generation asks for Spanish" do
    gap = LearningRoutesEngine::KnowledgeGap.create!(
      user: @user, learning_route: @route, topic: "Saludos", severity: :low,
      description: "necesita práctica", resolved: false
    )
    spy = PromptSpy.new({ "steps" => [{ "title" => "t", "description" => "d",
                                        "content_type" => "lesson", "estimated_minutes" => 10 }] }.to_json)

    spy.install do
      LearningRoutesEngine::ReinforcementGenerator.new(knowledge_gaps: [gap], route: @route).generate!
    end

    assert_spanish_directive(spy.system_prompts, "reinforcement_generation")
  end

  test "lesson content generation asks for Spanish" do
    spy = PromptSpy.new({ "title" => "T", "content" => "## Concepto: Hola\nContenido." }.to_json)

    spy.install { LearningRoutesEngine::ContentGenerationJob.new.perform(@step.id) }

    assert_spanish_directive(spy.system_prompts, "lesson_content")
  end

  test "route generation asks for the student's language" do
    spy = PromptSpy.new({ "route_name" => "R", "modules" => [] }.to_json)

    spy.install do
      LearningRoutesEngine::RouteGenerator.new(@profile).generate!
    rescue StandardError
      # The generator may fail downstream on the canned payload; the prompt has already
      # been captured by then, which is what this test is about.
    end

    assert_spanish_directive(spy.system_prompts, "route_generation")
  end

  # ── Titles must be localized too (§B) ───────────────────────────────────

  test "the quiz prompt carries the Spanish step title, not the English translation" do
    @step.update!(translations: { "en" => { "title" => "Basic greetings" },
                                  "es" => { "title" => "Saludos básicos" } })
    spy = PromptSpy.new({ "questions" => [] }.to_json)

    spy.install { LearningRoutesEngine::StepQuizGenerationJob.new.perform(@step.id) }

    # localized_title defaults to I18n.locale, which inside a job is the process
    # default (:en) rather than the route's language — so this prompt used to carry
    # "Basic greetings" while teaching a Spanish course.
    joined = (spy.system_prompts + spy.user_prompts).join("\n")

    assert_includes joined, "Saludos básicos", "the prompt should carry the Spanish title"
    assert_not_includes joined, "Basic greetings", "the prompt still carries the English title"
  end

  test "localized_title honours an explicit locale over I18n.locale" do
    @step.update!(translations: { "en" => { "title" => "Basic greetings" },
                                  "es" => { "title" => "Saludos básicos" } })

    I18n.with_locale(:en) do
      assert_equal "Basic greetings", @step.localized_title
      assert_equal "Saludos básicos", @step.localized_title("es"),
        "an explicit locale must win over I18n.locale — this is what jobs now pass"
    end
  end

  # ── §C: a missing locale is a bug, not a default ────────────────────────

  test "omitting locale raises in dev/test rather than silently meaning English" do
    error = assert_raises(ArgumentError) do
      AiOrchestrator::PromptBuilder.new(task_type: "step_quiz", variables: {}).build
    end

    assert_match(/without a `locale` variable/, error.message)
    assert_match(/step_quiz/, error.message, "the message should name the offending task type")
  end

  # Pretend we are not in dev/test, so the guard takes its production branch.
  def as_deployed_environment
    env = Rails.env
    env.define_singleton_method(:local?) { false }
    yield
  ensure
    env.singleton_class.send(:remove_method, :local?)
  end

  test "in production a missing locale falls back to the app default, not to English" do
    # Fail open for the student, loudly for us. The fallback tracks I18n.default_locale
    # rather than a hardcoded "English" — proven by moving the default and watching the
    # directive follow it.
    original_default = I18n.default_locale
    prompts = nil

    begin
      I18n.default_locale = :es
      as_deployed_environment do
        prompts = AiOrchestrator::PromptBuilder.new(task_type: "step_quiz", variables: {}).build
      end
    ensure
      I18n.default_locale = original_default
    end

    assert_includes prompts[:system], "Spanish",
      "the production fallback should follow I18n.default_locale, not a hardcoded English"
    assert_not_includes prompts[:system], ENGLISH_DIRECTIVE
  end

  test "the production fallback is logged as an error, not swallowed" do
    logged = []
    original_logger = Rails.logger
    Rails.logger = Logger.new(StringIO.new).tap do |l|
      l.define_singleton_method(:error) { |msg = nil, &b| logged << (msg || b&.call).to_s }
    end

    begin
      as_deployed_environment do
        AiOrchestrator::PromptBuilder.new(task_type: "step_quiz", variables: {}).build
      end
    ensure
      Rails.logger = original_logger
    end

    assert logged.any? { |m| m.include?("without a `locale` variable") },
      "a missing locale must be logged at error level in production"
  end

  # ── LocaleResolver itself ───────────────────────────────────────────────

  test "resolution order is route, then user, then application default" do
    resolver = AiOrchestrator::LocaleResolver

    # Route wins. NOTE: learning_routes.locale is NOT NULL, so in practice this branch
    # always answers — the later ones only matter for routes not yet persisted.
    assert_equal "es", resolver.content_locale(@route, user: @user)

    # No route → the user.
    assert_equal "es", resolver.content_locale(nil, user: @user)

    # Neither → the application default, never a hardcoded language name.
    assert_equal I18n.default_locale.to_s, resolver.content_locale(nil, user: nil)
  end

  test "target_locale is carried through for bilingual routes" do
    @route.update!(target_locale: "pt")
    vars = AiOrchestrator::LocaleResolver.for_route(@route, user: @user)

    assert_equal "es", vars[:locale]
    assert_equal "pt", vars[:target_locale]
  end

  test "a bilingual route produces the bilingual directive, not the monolingual one" do
    @route.update!(target_locale: "pt")
    spy = PromptSpy.new({ "questions" => [] }.to_json)

    spy.install { LearningRoutesEngine::StepQuizGenerationJob.new.perform(@step.id) }

    assert spy.system_prompts.any?
    assert_includes spy.system_prompts.first, "BILINGUAL"
    assert_includes spy.system_prompts.first, "Portuguese"
  end
end
