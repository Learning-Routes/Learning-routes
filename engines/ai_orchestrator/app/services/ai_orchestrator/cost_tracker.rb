module AiOrchestrator
  class CostTracker
    # Pricing per million tokens (in cents) - Feb 2026
    PRICING = {
      "gpt-5.2"            => { input: 175, output: 1400 },
      "gpt-5.1-codex-mini" => { input: 25, output: 200 },
      "claude-opus-4-6"    => { input: 500, output: 2500 },
      "claude-haiku-4-5"   => { input: 100, output: 500 },
      "claude-sonnet-4-5"  => { input: 300, output: 1500 },
      "elevenlabs"         => { flat: 0 }, # Plan-based
      "nanobanana-pro"     => { per_image: 10 },
      "nanobanana-flash"   => { per_image: 2 }
    }.freeze

    def self.estimate_cost(model:, input_tokens: 0, output_tokens: 0)
      pricing = PRICING[model]
      return 0 unless pricing

      if pricing[:flat]
        pricing[:flat]
      elsif pricing[:per_image]
        pricing[:per_image]
      else
        input_cost = (input_tokens / 1_000_000.0) * pricing[:input]
        output_cost = (output_tokens / 1_000_000.0) * pricing[:output]
        (input_cost + output_cost).ceil
      end
    end

    def self.daily_cost(date: Date.current)
      AiInteraction.where(created_at: date.all_day).sum(:cost_cents)
    end

    def self.monthly_cost(month: Date.current)
      AiInteraction.where(created_at: month.all_month).sum(:cost_cents)
    end

    def self.cost_by_model(period: Date.current.all_month)
      AiInteraction.where(created_at: period)
                   .group(:model)
                   .sum(:cost_cents)
    end

    def self.cost_by_user(user_id:, period: Date.current.all_month)
      AiInteraction.where(user_id: user_id, created_at: period).sum(:cost_cents)
    end
  end
end
