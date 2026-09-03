# frozen_string_literal: true

module AiOrchestrator
  # The one place that decides whether a paid provider call may happen.
  #
  # These two checks used to live inside `ModelRouter#execute`, which only two
  # of the eight AiClient construction sites go through. Both TTS paths
  # (AudioGenerator, SectionAudioGenerator) build an AiClient directly, so the
  # 5,000¢/day ceiling, the 500¢ per-user/day ceiling and the 20 rpm ElevenLabs
  # limit were never consulted for ANY audio. CostAlertJob runs hourly and only
  # reports after the money is gone.
  #
  # The guard now sits at `AiClient#chat`, which is the single funnel every
  # provider goes through — ruby_llm, ElevenLabs and gpt-image alike — so
  # "reachable without the guard" and "not a paid provider call" are the same
  # statement. `AiClient#initialize` already took `task_type:` and `user:`;
  # everything this needed was one layer down all along.
  #
  # ModelRouter no longer performs these checks itself. That is deliberate and
  # is what keeps a ModelRouter -> AiClient call checked exactly ONCE: the rate
  # limiter INCREMENTS a counter, so checking in both places would silently halve
  # every model's effective rpm. ModelRouter has no copy of this logic; it has
  # none at all, which is a stronger version of "one definition" than delegation.
  class SpendGuard
    # Raised when a ceiling refuses the call. This is a BUSINESS limit, not a
    # provider error: nothing failed, we declined to spend. `ModelRouter::
    # RateLimitExceeded` is an alias of this class, so the pre-existing
    # `rescue ModelRouter::RateLimitExceeded` in AiRequestJob still catches it.
    class LimitExceeded < StandardError
      # Which ceiling refused: :daily_budget, :user_budget or :rate_limit.
      attr_reader :kind

      def initialize(message, kind:)
        super(message)
        @kind = kind
      end
    end

    RATE_KEY_PREFIX = "ai_rate_limit"

    def self.call(model:, task_type: nil, user: nil)
      new(model: model, task_type: task_type, user: user).call
    end

    # Test support. The test environment uses `:null_store`, so rate counters do
    # not actually persist between examples today — but they would the moment
    # that changes, and the rate-limit tests need a real store to exercise the
    # counter at all. This resets the window rather than disabling the guard, so
    # the guard stays genuinely ACTIVE in every test.
    def self.reset_rate_limits!
      known_models = ModelRouter::RATE_LIMITS.keys | AiModelConfig.distinct.pluck(:model_name).compact
      known_models.each { |model| Rails.cache.delete("#{RATE_KEY_PREFIX}:#{model}") }
    end

    def initialize(model:, task_type: nil, user: nil)
      @model = model.to_s
      @task_type = task_type
      @user = user
    end

    def call
      check_rate_limit!
      check_cost_limit!
    end

    private

    def check_rate_limit!
      limit = rate_limit_for(@model)
      return unless limit

      key = "#{RATE_KEY_PREFIX}:#{@model}"

      # Atomic increment-then-check: increment first, check after.
      if Rails.cache.respond_to?(:increment)
        # Initialize key if missing, then atomically increment. `increment` can
        # return nil if the key write race-loses or the backend lacks
        # unless_exist semantics — coerce so we never compare nil > Integer.
        Rails.cache.write(key, 0, expires_in: 1.minute, unless_exist: true)
        count = Rails.cache.increment(key).to_i
        if count > limit
          Rails.cache.decrement(key)
          refuse!(:rate_limit, model: @model)
        end
      else
        current = Rails.cache.read(key).to_i
        refuse!(:rate_limit, model: @model) if current >= limit
        Rails.cache.write(key, current + 1, expires_in: 1.minute)
      end
    end

    def check_cost_limit!
      alerts = Rails.application.config.ai_cost_alerts

      daily = CostTracker.daily_cost_microcents
      daily_limit = alerts[:daily_limit].to_i * CostTracker::MICROCENTS_PER_CENT
      refuse!(:daily_budget) if daily >= daily_limit

      return unless @user

      user_daily = CostTracker.cost_by_user_microcents(user_id: @user.id, period: Date.current.all_day)
      user_limit = alerts[:per_user_daily].to_i * CostTracker::MICROCENTS_PER_CENT
      refuse!(:user_budget) if user_daily >= user_limit
    end

    # The message is user-safe and translated: it reaches a student through the
    # content-failure view, so it must not be an internal string, and it must not
    # tell them to "try again in a few minutes" when a DAILY ceiling has tripped.
    def refuse!(kind, **interpolations)
      raise LimitExceeded.new(
        I18n.t("ai_orchestrator.spend_guard.#{kind}", **interpolations),
        kind: kind
      )
    end

    def rate_limit_for(model_name)
      db_config = AiModelConfig.enabled.find_by(model_name: model_name, task_type: @task_type.to_s)
      db_config&.rate_limit || ModelRouter::RATE_LIMITS[model_name]
    end
  end
end
