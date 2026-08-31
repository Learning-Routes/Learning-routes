# frozen_string_literal: true

module AiOrchestrator
  class SpeechCostRecorder
    def self.record_tts!(user:, result:, task_type: "voice_narration")
      model_id = result[:model_id].presence || "eleven_multilingual_v2"
      characters = result[:billed_characters]
      record!(user: user, model: model_id, task_type: task_type,
              units: characters, unit_name: "characters", characters: characters)
    end

    def self.record_stt!(user:, duration_seconds:)
      milliseconds = duration_seconds && (BigDecimal(duration_seconds.to_s) * 1_000).round
      record!(user: user, model: "scribe_v2", task_type: "transcription",
              units: milliseconds, unit_name: "audio_milliseconds",
              audio_seconds: duration_seconds)
    end

    def self.record!(user:, model:, task_type:, units:, unit_name:, **usage)
      priced = units.present? && units.to_i.positive?
      microcents = priced ? CostTracker.estimate_microcents(model: model, **usage) : 0
      AiInteraction.create!(
        user: user, model: model, task_type: task_type, prompt: "provider_usage",
        response: "provider_completed", status: :completed, provider_units: units,
        pricing_status: priced ? "priced" : "unpriced",
        pricing_version: priced ? "elevenlabs-2026-08-31" : nil,
        cost_microcents: microcents, cost_cents: CostTracker.microcents_to_cents(microcents),
        metadata: { provider_unit: unit_name }
      )
    rescue ActiveRecord::ActiveRecordError => e
      Rails.logger.warn("[SpeechCostRecorder] Metering failed (#{e.class.name})")
      nil
    end
    private_class_method :record!
  end
end
