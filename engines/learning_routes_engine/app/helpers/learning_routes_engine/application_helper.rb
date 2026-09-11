# frozen_string_literal: true

module LearningRoutesEngine
  module ApplicationHelper
    # The title a block shows, resolved AT RENDER TIME.
    #
    # The parser used to bake a literal into `parsed_sections` when a heading had
    # no title — Spanish for prose blocks ("Concepto", "Resumen", "Comprueba tu
    # conocimiento"), English for interactive ones ("Match", "Playground"). It
    # runs inside `ContentPipelineJob`, whose `I18n.locale` is whatever the
    # worker happens to have and not the route's, so a default persisted from a
    # job was in the wrong language about half the time — and stayed wrong,
    # because the array is a cache the page renders from.
    #
    # NEVER PERSIST A TRANSLATION. The parser emits nil; this fills it in the
    # reader's language, from the same persisted section, on every request.
    def block_title(section)
      explicit = section[:title].presence || section["title"].presence
      return explicit if explicit

      # One resolver, shared with LessonAssistantAgent — a service cannot reach a
      # view helper, and when this logic lived only here the agent sent the model
      # a blank title for every untitled block.
      ContentEngine::LessonBlocks.default_title(section[:type] || section["type"])
    end

    # The procedural order for one lesson block, for this student, on this attempt.
    #
    # `@block_attempt_counts` is loaded once per render by StepsController; a section
    # with no attempt row yet is simply absent from it and seeds at attempt 0, which is
    # the first-render case. Outside a step context (preview, agent reply) there is no
    # current_user and no ivar, and BlockVariant is nil-safe by design, so this returns a
    # usable variant instead of raising -- matching submitBlock's fail-quiet behaviour.
    def block_variant_for(step, section_index)
      BlockVariant.for(
        user: (current_user if respond_to?(:current_user)),
        route_step: step,
        section_index: section_index,
        attempt_number: (@block_attempt_counts || {})[section_index].to_i
      )
    end
  end
end
