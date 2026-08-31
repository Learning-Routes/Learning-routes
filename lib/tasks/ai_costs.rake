# frozen_string_literal: true

namespace :ai_costs do
  desc "Report exact billable AI spend and explicitly unpriced provider usage"
  task report: :environment do
    days = (ENV["DAYS"] || 30).to_i
    since = days.days.ago
    billable = AiOrchestrator::AiInteraction.billable.where(created_at: since..)

    puts "billable spend, last #{days} days"
    billable.group(:model, :task_type).sum(:cost_microcents).each do |(model, task), microcents|
      puts "  #{model} #{task}: #{microcents} microcents"
    end

    AiOrchestrator::AiInteraction.unpriced.where(created_at: since..)
      .group(:model).sum(:provider_units).each do |model, units|
      unit_label = model == "tavily" ? "credits" : "units"
      puts "  #{model}: #{units.to_i} #{unit_label}, cost unknown"
    end
  end

  desc "Dry-run historical cost reconciliation; APPLY=1 enables supported writes"
  task backfill: :environment do
    apply = ENV["APPLY"] == "1"
    puts apply ? "APPLY mode" : "DRY RUN (no writes)"

    AiOrchestrator::AiInteraction.unpriced.group(:model).sum(:provider_units).each do |model, units|
      unit_label = model == "tavily" ? "credits" : "units"
      puts "  #{model}: #{units.to_i} #{unit_label}, cost unknown; no historical rate invented"
    end
  end
end
