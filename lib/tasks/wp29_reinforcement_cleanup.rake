# frozen_string_literal: true

# WP-29 §4, part 3: the junk reinforcement steps already in production.
#
# A RAKE TASK, NOT A MIGRATION, and the reason is specific rather than stylistic.
# `bin/docker-entrypoint:16` runs `./bin/rails db:prepare` on EVERY boot, so a
# destructive migration would delete production rows automatically on the next
# deploy — before the owner ever saw the census the brief asks for. A task runs
# when a human decides it does. (It also matches the read-only census precedent
# set by `wp21:stuck_checks`, and the general guidance to keep data changes out of
# schema migrations.)
#
# Two tasks, deliberately separate:
#
#   bin/rails wp29:census    read only, changes nothing, prints the numbers
#   bin/rails wp29:cleanup   deletes, and only what nobody has touched
#
namespace :wp29 do
  # Qualified: `includes` becomes a JOIN once this string condition references a
  # column, and `metadata` exists on more than one joined table.
  REINFORCEMENT = "learning_routes_engine_route_steps.metadata->>'reinforcement' = 'true'"
  # Untouched: never opened. A step a student has started or finished is THEIR
  # WORK and is never deleted, however junk its origin.
  UNTOUCHED = { status: %i[locked available] }.freeze

  desc "Count reinforcement steps and how many a student has actually touched (read only)"
  task census: :environment do
    step = LearningRoutesEngine::RouteStep
    all = step.where(REINFORCEMENT)
    untouched = all.where(**UNTOUCHED)
    touched = all.where.not(**UNTOUCHED)

    by_route = all.group(:learning_route_id).count
    worst = by_route.max_by(5) { |_id, count| count }

    puts "reinforcement steps, total:        #{all.count}"
    puts "  untouched (locked/available):    #{untouched.count}   <- what cleanup would delete"
    puts "  touched (in progress/completed): #{touched.count}   <- never deleted"
    puts "routes carrying any:               #{by_route.size}"
    puts
    puts "worst routes:"
    worst.each { |route_id, count| puts "  #{route_id}  #{count} steps" }
    puts
    puts "routes whose steps are ALL untouched (safe to clear entirely): " \
         "#{by_route.keys.count { |id| all.where(learning_route_id: id).where.not(**UNTOUCHED).none? }}"
    puts
    puts "Nothing was modified. Run wp29:cleanup to delete the untouched ones."
  end

  desc "Delete untouched reinforcement steps (destructive; run the census first)"
  task cleanup: :environment do
    step = LearningRoutesEngine::RouteStep
    # Eager-load what `destroy!` cascades into. `strict_loading_by_default` is on
    # and only LOGS in production, so without this the task would emit a
    # violation per row per association while quietly issuing the N+1 anyway.
    doomed = step.where(REINFORCEMENT).where(**UNTOUCHED)
                 .includes(:step_quiz, :ai_contents, :voice_responses, :comments, :likes)
    total = doomed.count

    if total.zero?
      puts "nothing to delete."
      next
    end

    puts "deleting #{total} untouched reinforcement steps..."

    deleted = 0
    affected_routes = doomed.distinct.pluck(:learning_route_id)

    # Batched: `find_each` keeps this off the heap on a table that grew by three
    # rows per exam submission.
    doomed.find_each(batch_size: 200) do |route_step|
      route_step.destroy!
      deleted += 1
    end

    # `total_steps` is denormalised onto the route and every progress bar reads
    # it, so leaving it stale would replace one visible defect with another.
    affected_routes.each do |route_id|
      route = LearningRoutesEngine::LearningRoute.find_by(id: route_id)
      next if route.nil?

      route.update_columns(
        total_steps: LearningRoutesEngine::RouteStep.where(learning_route_id: route_id).count,
        updated_at: Time.current
      )
    end

    puts "deleted #{deleted}; recounted total_steps on #{affected_routes.size} routes."
    puts "There is no undo for this. The touched steps were left alone."
  end
end
