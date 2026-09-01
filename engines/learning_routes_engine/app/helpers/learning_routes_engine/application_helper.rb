# frozen_string_literal: true

module LearningRoutesEngine
  module ApplicationHelper
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
