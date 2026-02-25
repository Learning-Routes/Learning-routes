module AiOrchestrator
  class CostTracker
    # Pricing per million tokens (in cents) - Feb 2026
    PRICING = {
      "gpt-5.2"            => { input: 175, output: 1400 },
      "gpt-5.1-codex-mini" => { input: 25, output: 200 },
      "claude-opus-4-5"    => { input: 500, output: 2500 },
      "claude-haiku-4-5"   => { input: 100, output: 500 },
      "claude-sonnet-4-5"  => { input: 300, output: 1500 },
      "elevenlabs"         => { flat: 0 },
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

    def self.weekly_cost(date: Date.current)
      start_of_week = date.beginning_of_week
      end_of_week = date.end_of_week
      AiInteraction.where(created_at: start_of_week.beginning_of_day..end_of_week.end_of_day).sum(:cost_cents)
    end

    def self.cost_by_model(period: Date.current.all_month)
      AiInteraction.where(created_at: period)
                   .group(:model)
                   .sum(:cost_cents)
    end

    def self.cost_by_task(period: Date.current.all_month)
      AiInteraction.where(created_at: period)
                   .group(:task_type)
                   .sum(:cost_cents)
    end

    def self.cost_by_user(user_id:, period: Date.current.all_month)
      AiInteraction.where(user_id: user_id, created_at: period).sum(:cost_cents)
    end

    # Check all alert thresholds and return any violations
    def self.check_alerts(user: nil)
      alerts = Rails.application.config.ai_cost_alerts
      violations = []

      daily = daily_cost
      if daily >= alerts[:daily_limit]
        violations << { type: :daily_limit, current: daily, limit: alerts[:daily_limit] }
      end

      monthly = monthly_cost
      if monthly >= alerts[:monthly_limit]
        violations << { type: :monthly_limit, current: monthly, limit: alerts[:monthly_limit] }
      end

      if user
        user_daily = cost_by_user(user_id: user.id, period: Date.current.all_day)
        if user_daily >= alerts[:per_user_daily]
          violations << { type: :per_user_daily, user_id: user.id, current: user_daily, limit: alerts[:per_user_daily] }
        end
      end

      violations
    end

    def self.alert_exceeded?(user: nil)
      check_alerts(user: user).any?
    end

    # Analytics: usage summary for a period
    def self.usage_summary(period: Date.current.all_month)
      interactions = AiInteraction.where(created_at: period)

      {
        total_requests: interactions.count,
        successful: interactions.successful.count,
        failed: interactions.failed_requests.count,
        cached_hits: interactions.cached_hits.count,
        total_cost_cents: interactions.sum(:cost_cents),
        total_tokens: interactions.sum(:tokens_used),
        avg_latency_ms: interactions.where.not(latency_ms: nil).average(:latency_ms)&.round(2),
        cost_by_model: cost_by_model(period: period),
        cost_by_task: cost_by_task(period: period),
        cache_hit_rate: calculate_cache_hit_rate(interactions)
      }
    end

    def self.user_usage_summary(user_id:, period: Date.current.all_month)
      interactions = AiInteraction.where(user_id: user_id, created_at: period)

      {
        total_requests: interactions.count,
        total_cost_cents: interactions.sum(:cost_cents),
        total_tokens: interactions.sum(:tokens_used),
        by_task: interactions.group(:task_type).count,
        by_model: interactions.group(:model).count
      }
    end

    def self.calculate_cache_hit_rate(interactions)
      total = interactions.count
      return 0.0 if total.zero?
      (interactions.cached_hits.count.to_f / total * 100).round(2)
    end
    private_class_method :calculate_cache_hit_rate
  end
end
