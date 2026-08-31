module AiOrchestrator
  class CostTracker
    # Pricing per million tokens (in cents) - Feb 2026
    PRICING = {
      "gpt-5.2"            => { input: 175, output: 1400 },
      "gpt-4.1-mini" => { input: 40, output: 160 },
      "claude-opus-4-5"    => { input: 500, output: 2500 },
      "claude-haiku-4-5"   => { input: 100, output: 500 },
      "claude-sonnet-4-5"  => { input: 300, output: 1500 },
      "elevenlabs"         => { flat: 0 },
      "gpt-image-1"        => { per_image: 7 },
      "tavily"             => { per_request: 0 }
    }.freeze

    MICROCENTS_PER_CENT = 10_000
    MICROCENTS_PER_DOLLAR = 1_000_000

    def self.estimate_microcents(model:, input_tokens: 0, output_tokens: 0,
                                 image_input_tokens: 0, characters: nil, audio_seconds: nil)
      pricing = PRICING[model]
      return 0 unless pricing

      if pricing[:flat]
        pricing[:flat] * MICROCENTS_PER_CENT
      elsif pricing[:per_image]
        pricing[:per_image] * MICROCENTS_PER_CENT
      elsif pricing[:per_request]
        pricing[:per_request] * MICROCENTS_PER_CENT
      else
        numerator = input_tokens.to_i * pricing[:input].to_i
        numerator += output_tokens.to_i * pricing[:output].to_i
        Rational(numerator, 100).round
      end
    end

    def self.microcents_to_cents(microcents)
      Rational(microcents.to_i, MICROCENTS_PER_CENT).round
    end

    def self.estimate_cost(**attributes)
      microcents_to_cents(estimate_microcents(**attributes))
    end

    def self.daily_cost_microcents(date: Date.current)
      billable.where(created_at: date.all_day).sum(:cost_microcents)
    end

    def self.weekly_cost_microcents(date: Date.current)
      period = date.beginning_of_week.beginning_of_day..date.end_of_week.end_of_day
      billable.where(created_at: period).sum(:cost_microcents)
    end

    def self.monthly_cost_microcents(month: Date.current)
      period = month.beginning_of_month.beginning_of_day..month.end_of_month.end_of_day
      billable.where(created_at: period).sum(:cost_microcents)
    end

    def self.cost_by_model_microcents(period: nil)
      period ||= current_month_period
      billable.where(created_at: period).group(:model).sum(:cost_microcents)
    end

    def self.cost_by_task_microcents(period: nil)
      period ||= current_month_period
      billable.where(created_at: period).group(:task_type).sum(:cost_microcents)
    end

    def self.cost_by_user_microcents(user_id:, period: nil)
      period ||= current_month_period
      billable.where(user_id: user_id, created_at: period).sum(:cost_microcents)
    end

    def self.daily_cost(date: Date.current)
      microcents_to_cents(daily_cost_microcents(date: date))
    end

    def self.monthly_cost(month: Date.current)
      microcents_to_cents(monthly_cost_microcents(month: month))
    end

    def self.weekly_cost(date: Date.current)
      microcents_to_cents(weekly_cost_microcents(date: date))
    end

    def self.cost_by_model(period: nil)
      cost_by_model_microcents(period: period).transform_values { |value| microcents_to_cents(value) }
    end

    def self.cost_by_task(period: nil)
      cost_by_task_microcents(period: period).transform_values { |value| microcents_to_cents(value) }
    end

    def self.cost_by_user(user_id:, period: nil)
      microcents_to_cents(cost_by_user_microcents(user_id: user_id, period: period))
    end

    # Check all alert thresholds and return any violations
    def self.check_alerts(user: nil)
      alerts = Rails.application.config.ai_cost_alerts
      violations = []

      daily_microcents = daily_cost_microcents
      if daily_microcents >= alerts[:daily_limit].to_i * MICROCENTS_PER_CENT
        violations << { type: :daily_limit, current: microcents_to_cents(daily_microcents),
                        limit: alerts[:daily_limit] }
      end

      monthly_microcents = monthly_cost_microcents
      if monthly_microcents >= alerts[:monthly_limit].to_i * MICROCENTS_PER_CENT
        violations << { type: :monthly_limit, current: microcents_to_cents(monthly_microcents),
                        limit: alerts[:monthly_limit] }
      end

      if user
        user_microcents = cost_by_user_microcents(user_id: user.id, period: Date.current.all_day)
        if user_microcents >= alerts[:per_user_daily].to_i * MICROCENTS_PER_CENT
          violations << { type: :per_user_daily, user_id: user.id,
                          current: microcents_to_cents(user_microcents),
                          limit: alerts[:per_user_daily] }
        end
      end

      violations
    end

    def self.alert_exceeded?(user: nil)
      check_alerts(user: user).any?
    end

    # Analytics: usage summary for a period
    def self.usage_summary(period: nil)
      period ||= current_month_period
      interactions = AiInteraction.where(created_at: period)

      {
        total_requests: interactions.count,
        successful: interactions.successful.count,
        failed: interactions.failed_requests.count,
        cached_hits: interactions.cached_hits.count,
        total_cost_cents: microcents_to_cents(
          interactions.merge(AiInteraction.billable).sum(:cost_microcents)
        ),
        total_tokens: interactions.sum(:tokens_used),
        avg_latency_ms: interactions.where.not(latency_ms: nil).average(:latency_ms)&.round(2),
        cost_by_model: cost_by_model(period: period),
        cost_by_task: cost_by_task(period: period),
        cache_hit_rate: calculate_cache_hit_rate(interactions)
      }
    end

    def self.user_usage_summary(user_id:, period: nil)
      period ||= current_month_period
      interactions = AiInteraction.where(user_id: user_id, created_at: period)

      {
        total_requests: interactions.count,
        total_cost_cents: microcents_to_cents(
          interactions.merge(AiInteraction.billable).sum(:cost_microcents)
        ),
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

    def self.billable
      AiInteraction.billable
    end
    private_class_method :billable

    def self.current_month_period
      Date.current.beginning_of_month.beginning_of_day..Date.current.end_of_month.end_of_day
    end
    private_class_method :current_month_period
  end
end
