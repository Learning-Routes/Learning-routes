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

    scope = AiOrchestrator::AiInteraction.unpriced
      .where(status: :completed, cached: [false, nil])
    recoverable = 0
    before = AiOrchestrator::AiInteraction.billable.sum(:cost_microcents)

    scope.find_each do |row|
      calculation = case row.model
      when "gpt-5.2", "gpt-4.1-mini", "claude-opus-4-5", "claude-haiku-4-5", "claude-sonnet-4-5"
        next if row.input_tokens.nil? || row.output_tokens.nil?
        next unless row.input_tokens.positive? || row.output_tokens.positive?

        [AiOrchestrator::CostTracker.estimate_microcents(
          model: row.model, input_tokens: row.input_tokens, output_tokens: row.output_tokens
        ), "text-rates-2026-08-31"]
      when "elevenlabs"
        next unless row.input_tokens.to_i.positive?

        [AiOrchestrator::CostTracker.estimate_microcents(
          model: "eleven_multilingual_v2", characters: row.input_tokens
        ), "elevenlabs-multilingual-v2-2026-08-31"]
      end
      next unless calculation

      recoverable += 1
      next unless apply

      microcents, version = calculation
      AiOrchestrator::AiInteraction.where(id: row.id).update_all(
        cost_microcents: microcents,
        cost_cents: AiOrchestrator::CostTracker.microcents_to_cents(microcents),
        pricing_status: "priced", pricing_version: version, updated_at: Time.current
      )
    end

    after = AiOrchestrator::AiInteraction.billable.sum(:cost_microcents)
    puts "  recoverable rows: #{recoverable}"
    puts "  exact totals: before=#{before} microcents after=#{after} microcents"

    AiOrchestrator::AiInteraction.unpriced.group(:model).sum(:provider_units).each do |model, units|
      unit_label = model == "tavily" ? "credits" : "units"
      puts "  #{model}: #{units.to_i} #{unit_label}, cost unknown; no historical rate invented"
    end
  end
end
