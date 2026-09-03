# frozen_string_literal: true

# WP-21. Read-only census of students stranded by the zero-pixel quiz modal.
#
# A `check` past section 0 rendered its modal inside a `display:none` section, so
# it had no size and could not be answered. Navigation is gated on a satisfied
# BlockAttempt for that (user, route_step, section_index), so anyone who reached
# such a step has an unsatisfiable gate and cannot finish it.
#
# READ ONLY. It writes nothing and is deliberately not paired with a repair task:
# what to do about the stranded steps is the owner's decision, not a migration.
# Run on the production box:
#
#   bin/rails wp21:stuck_checks
#
namespace :wp21 do
  desc "Count steps a student cannot finish because a check block was unanswerable (read only)"
  task stuck_checks: :environment do
    BlockAttempt = LearningRoutesEngine::BlockAttempt
    stuck = Hash.new { |h, k| h[k] = [] }
    steps_scanned = 0

    LearningRoutesEngine::RouteStep
      .where.not(status: :completed)
      .where("metadata ? 'parsed_sections'")
      .includes(learning_route: { learning_profile: :user })
      .find_each(batch_size: 200) do |step|
        sections = step.metadata["parsed_sections"]
        next unless sections.is_a?(Array)

        steps_scanned += 1
        user_id = step.learning_route&.learning_profile&.user_id
        next if user_id.nil?

        # Only checks PAST section 0 were affected: index 0 is the one section
        # the loop leaves visible.
        gating_indices = sections.each_with_index.filter_map do |section, index|
          index if index.positive? && section.is_a?(Hash) && section["type"] == "check"
        end
        next if gating_indices.empty?

        satisfied = BlockAttempt
          .where(user_id: user_id, route_step_id: step.id, section_index: gating_indices)
          .where.not(completed_at: nil)
          .pluck(:section_index)

        unanswerable = gating_indices - satisfied
        stuck[user_id] << { step_id: step.id, sections: unanswerable } if unanswerable.any?
      end

    total_sections = stuck.values.flatten(1).sum { |row| row[:sections].size }

    puts "steps scanned (not completed, with parsed_sections): #{steps_scanned}"
    puts "students with at least one unfinishable step:        #{stuck.size}"
    puts "steps they cannot finish:                            #{stuck.values.sum(&:size)}"
    puts "unanswered check sections behind those steps:        #{total_sections}"
    puts
    puts "No data was modified."
  end
end
