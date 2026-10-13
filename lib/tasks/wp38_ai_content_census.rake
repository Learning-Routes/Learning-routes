# frozen_string_literal: true

namespace :wp38 do
  desc "Count steps carrying more than one AiContent row of the same content_type (expect 0)."
  # READ-ONLY. It deletes nothing and decides nothing: which of two bodies is the
  # real one is a judgement about content, not a rule a task can apply.
  #
  # `SectionResolver.lesson_content_for` now answers deterministically (oldest
  # first), which stops the app disagreeing with itself about where the lesson body
  # lives. It does not stop a step having two bodies — content_generation_job.rb:36
  # and content_pipeline_job.rb:152 each `create!` a row without deleting an earlier
  # one. This is how many there are.
  task ai_content_census: :environment do
    duplicates = ContentEngine::AiContent
      .group(:route_step_id, :content_type)
      .having("COUNT(*) > 1")
      .count

    steps = duplicates.keys.map(&:first).uniq

    puts "[wp38:ai_content_census] #{steps.size} step(s) carry more than one body of the same type."

    duplicates
      .sort_by { |(step_id, type), _count| [step_id.to_s, type.to_s] }
      .each do |(step_id, type), count|
        # `group` on an enum column can hand back either the label or the integer
        # depending on the adapter's type casting, so both are turned into the label.
        label = type.is_a?(Integer) ? ContentEngine::AiContent.content_types.key(type) : type
        puts "  step=#{step_id} content_type=#{label} rows=#{count}"
      end
  end
end
