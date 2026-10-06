# frozen_string_literal: true

module LearningRoutesEngine
  # WP-37 §1.3. Which primary step a reinforcement step hangs from — the ONE rule,
  # read by the journey (RoutesController#build_journey_stages) and counted by the
  # census (wp37:reinforcement_parents), so the map and the census cannot disagree.
  #
  #   1. the stored `triggering_step_id`, when it names a PRIMARY step of the same
  #      module (AdaptiveDifficulty writes it from the same sources it takes the
  #      module from, so it normally does);
  #   2. else the nearest preceding primary step in the module, by position —
  #      every row written before the key existed;
  #   3. else nothing: an orphan, which the map hangs from the module node.
  #
  # The guard in (1) only refuses ids that cannot be a parent in a depth-3 tree —
  # a step since moved to another module, or a trigger that was itself
  # reinforcement — rather than draw an edge across modules.
  module ReinforcementParents
    Resolution = Data.define(:parent_id, :source)

    # Boolean true only. A string "true" from an old writer is NOT reinforcement
    # here; the census reports how many there are.
    def self.reinforcement?(step)
      step.metadata.is_a?(Hash) && step.metadata["reinforcement"] == true
    end

    # `steps`: ONE module's steps, already sorted by position.
    def self.resolve(steps)
      primary_ids = steps.reject { |step| reinforcement?(step) }.to_set(&:id)
      last_primary_id = nil

      steps.each_with_object({}) do |step, resolved|
        unless reinforcement?(step)
          last_primary_id = step.id
          next
        end

        stored = step.metadata["triggering_step_id"]
        resolved[step.id] =
          if stored && primary_ids.include?(stored)
            Resolution.new(parent_id: stored, source: :stored)
          elsif last_primary_id
            Resolution.new(parent_id: last_primary_id, source: :position)
          else
            Resolution.new(parent_id: nil, source: :orphan)
          end
      end
    end
  end
end
