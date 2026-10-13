# frozen_string_literal: true

namespace :wp37 do
  desc "Count how reinforcement steps resolve their parent on the journey map (read-only)."
  # READ-ONLY. It resolves parents with the same rule the journey uses
  # (LearningRoutesEngine::ReinforcementParents), so its numbers are the map's.
  #
  #   stored   — the step names its trigger (written since WP-37);
  #   position — hung from the nearest preceding primary step: legacy rows, AND
  #              rows whose stored id was rejected (it names no primary step of
  #              the module — e.g. a failed re-assessment inside a triplet). The
  #              rejected ones are counted separately so neither is misread.
  #   orphan   — no preceding primary step in its module: hung from the module.
  #
  # It also counts `reinforcement` values that are present but not boolean true.
  # The map treats only `true` as reinforcement, so those are drawn as peers;
  # this line is how they are seen rather than silently dropped.
  task reinforcement_parents: :environment do
    flagged = LearningRoutesEngine::RouteStep.where("metadata ? 'reinforcement'")
    non_boolean = flagged.to_a.count { |step| step.metadata["reinforcement"] != true }

    module_ids = flagged.distinct.pluck(:route_module_id)
    steps_by_module = LearningRoutesEngine::RouteStep.where(route_module_id: module_ids)
                                                     .order(:position).to_a.group_by(&:route_module_id)

    per_route = Hash.new { |hash, key| hash[key] = Hash.new(0) }
    steps_by_module.each_value do |steps|
      by_id = steps.index_by(&:id)
      LearningRoutesEngine::ReinforcementParents.resolve(steps).each do |step_id, resolution|
        step = by_id.fetch(step_id)
        per_route[step.learning_route_id][resolution.source] += 1
        rejected = resolution.source != :stored && step.metadata["triggering_step_id"].present?
        per_route[step.learning_route_id][:rejected] += 1 if rejected
      end
    end

    totals = per_route.values.each_with_object(Hash.new(0)) { |counts, sum| counts.each { |k, v| sum[k] += v } }
    total = totals[:stored] + totals[:position] + totals[:orphan]

    puts "[wp37:reinforcement_parents] #{total} reinforcement step(s) in #{per_route.size} route(s): " \
         "stored=#{totals[:stored]} position=#{totals[:position]} (stored id rejected: #{totals[:rejected]}) " \
         "orphan=#{totals[:orphan]}"
    puts "[wp37:reinforcement_parents] #{non_boolean} step(s) carry a reinforcement value that is not " \
         "boolean true (drawn as primary steps)"
    per_route.sort_by { |route_id, _| route_id.to_s }.each do |route_id, counts|
      puts "  route=#{route_id} stored=#{counts[:stored]} position=#{counts[:position]} " \
           "(stored id rejected: #{counts[:rejected]}) orphan=#{counts[:orphan]}"
    end
  end
end
