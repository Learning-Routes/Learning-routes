require "test_helper"

# THE CLASS: a persisted section carries a language.
#
# WP-33 §4. When a heading had no title the parser wrote a literal into
# `parsed_sections` — Spanish for prose blocks ("Concepto", "Resumen",
# "Comprueba tu conocimiento", "Audio explicación"), English for interactive
# ones ("Match", "Visual", "Playground", "Scenario"). The parser runs inside
# `ContentPipelineJob`, whose `I18n.locale` is whatever the worker happens to
# have — not the route's — so the default was baked in the wrong language about
# half the time, and stayed wrong, because that array is the cache the page
# renders from.
#
# Nothing gates on a title: `BlockGrader` never reads one. The two places that
# USE one are `SectionImagesController` (alt text and caption) and
# `LessonAssistantAgent` (prompt context), and both are covered below.
module LearningRoutesEngine
  class BlockTitlesHaveNoLanguageTest < ActionDispatch::IntegrationTest
    LB = ContentEngine::LessonBlocks

    # `## Heading:` with nothing after the colon is what an untitled block looks
    # like. A BARE `## Heading` with no colon is something else entirely: the
    # parser treats the keyword as the title and the block as a concept, so
    # `## Match` becomes a concept called "Match". That is pre-existing, outside
    # this package, and recorded in the handoff — the fixture below uses the
    # colon form because that is the one that reaches a default title.
    UNTITLED = <<~MARKDOWN.freeze
      ## Concepto:
      Prose without a title.

      ## Ejemplo:
      An example without a title.

      ## Consejo:
      A tip without a title.

      ## Match:
      Dog ==> Perro
      Cat ==> Gato

      ## Playground:
      ```python
      print(1)
      ```

      ## Pregunta:
      A) Yes
      B) No
      CORRECTA: A
    MARKDOWN

    test "no untitled heading persists a title at all" do
      sections = ContentEngine::LessonSectionParser.call(UNTITLED)

      titled = sections.reject { |s| s[:title].nil? }
      assert_equal [], titled.map { |s| [s[:type], s[:title]] },
        "the parser persisted a title for a heading that had none; whatever " \
        "language it is in, it is wrong for half the routes"
    end

    # The sweep: the parser source must not contain a default title literal at
    # all. Written against the SOURCE because a literal can hide behind a branch
    # no fixture reaches.
    test "the parser source carries no default title literal" do
      source = File.read(Rails.root.join(
        "engines/content_engine/app/services/content_engine/lesson_section_parser.rb"
      ))
      literals = %w[Concepto Resumen Ejemplo Consejo Lección Match Visual Playground
                    Scenario Flashcards Simulation Complete] +
                 ["Comprueba tu conocimiento", "Audio explicación"]

      offenders = literals.select { |literal| source.match?(/title:\s*(?:[\w.]+\s*\|\|\s*)?"#{Regexp.escape(literal)}"/) }

      assert_equal [], offenders,
        "these are persisted into parsed_sections and cannot be translated afterwards"
    end

    # The contract that keeps the helper honest: every declared block type has a
    # default title in BOTH locales, or `block_title` renders a missing-key blob.
    test "every block type has a default title in both locales" do
      %i[en es].each do |locale|
        missing = LB::BLOCKS.keys.reject do |type|
          I18n.exists?("learning_engine.blocks.default_title.#{type}", locale)
        end

        assert_equal [], missing,
          "#{locale}: these block types have no default title, so an untitled " \
          "block of that type renders a translation-missing blob"
      end
    end

    test "the same persisted section reads its title in the reader's language" do
      section = { "type" => "drag_drop", "pairs" => [] }

      es = I18n.with_locale(:es) { helper_title(section) }
      en = I18n.with_locale(:en) { helper_title(section) }

      assert_equal "Emparejar", es
      assert_equal "Match", en
      assert_not_equal es, en, "one persisted section must read differently in each language"
    end

    test "an explicit title from the heading is never overridden" do
      sections = ContentEngine::LessonSectionParser.call("## Concepto: Los saludos\nProse.\n")
      concept = sections.find { |s| s[:type] == "concept" }

      assert_equal "Los saludos", concept[:title]
      assert_equal "Los saludos", I18n.with_locale(:en) { helper_title(concept.as_json) }
    end

    # `SectionImagesController` uses the title as alt text and caption. With the
    # literal gone it must fall back to the same default, or an untitled visual
    # loses its accessible name.
    # Finding 10. The comment at the top of this file claims LessonAssistantAgent
    # is "covered below" and it never was — so the one consumer of a block title
    # that is NOT a view went unnoticed when §4 moved the default out of the
    # parser. `block_title` resolves it, but that lives in
    # LearningRoutesEngine::ApplicationHelper and the agent is a ContentEngine
    # service with no access to it, so `- Title: #{@section[:title]}` interpolated
    # nil and the model was handed an empty field.
    test "the assistant prompt names an untitled section instead of sending a blank" do
      section = ContentEngine::LessonSectionParser.call(UNTITLED)
        .find { |s| s[:type] == "check" } || flunk("the fixture has no check section")
      assert_nil section[:title], "the premise: the parser persists nothing"

      agent = ContentEngine::LessonAssistantAgent.new(
        step: assistant_step, user: @assistant_user, section: section
      )
      prompt = agent.send(:system_prompt)

      assert_no_match(/^\s*- Title:\s*$/, prompt,
        "the model was handed an empty Title field for an untitled block")
      assert_match(/- Title: .*\S/, prompt)
      assert_includes prompt, I18n.t("learning_engine.blocks.default_title.check", locale: :es),
        "the agent must resolve the same default the view does, in the route's language"
    end

    test "an untitled visual still has an accessible name" do
      section = { "type" => "visual", "body" => "A diagram." }

      assert_equal I18n.t("learning_engine.blocks.default_title.visual", locale: :es),
        I18n.with_locale(:es) { helper_title(section) }
    end

    private

    # Only the assistant test needs a persisted route; the rest of this file runs
    # against the parser and the helper directly, so this stays out of `setup`.
    def assistant_step
      @assistant_user = Core::User.create!(
        name: "Assistant", email: "assist-#{SecureRandom.hex(4)}@example.com",
        password: "password123", password_confirmation: "password123",
        email_verified_at: Time.current, locale: "es"
      )
      profile = LearningRoutesEngine::LearningProfile.create!(
        user: @assistant_user, current_level: "beginner"
      )
      route = LearningRoutesEngine::LearningRoute.create!(
        learning_profile: profile, topic: "Portugués", locale: "es", status: :active
      )
      route.route_steps.create!(
        title: "Paso", position: 0, status: :available, content_type: "lesson",
        delivery_format: "text", level: :nv1, bloom_level: 1
      )
    end

    def helper_title(section)
      view = ActionView::Base.empty.tap { |v| v.extend(LearningRoutesEngine::ApplicationHelper) }
      view.block_title(section.deep_symbolize_keys.merge(section))
    end
  end
end
