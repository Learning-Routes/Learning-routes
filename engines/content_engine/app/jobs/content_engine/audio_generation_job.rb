module ContentEngine
  class AudioGenerationJob < ApplicationJob
    queue_as :default

    retry_on Net::OpenTimeout, Net::ReadTimeout, Errno::ECONNRESET,
             wait: :polynomially_longer, attempts: 3

    # ElevenLabs RequestErrors can be transient (503, rate-limited) or terminal (401).
    # We can't cheaply distinguish them, so retry twice — AudioGenerator's in-service
    # voice fallback already handles the "voice-specific failure" case.
    retry_on AiOrchestrator::AiClient::RequestError,
             wait: :polynomially_longer, attempts: 2

    def perform(route_step_id)
      step = LearningRoutesEngine::RouteStep.find(route_step_id)
      content = AudioGenerator.generate!(step)

      Turbo::StreamsChannel.broadcast_replace_to(
        "step_content_#{step.id}",
        target: "audio-player-#{step.id}",
        partial: "content_engine/audio/player",
        locals: { step: step, ai_content: content }
      )
    rescue => e
      # Don't catch the retry_on classes here — that turns transient errors into
      # silent failures. Re-raise them; let retry_on schedule a retry.
      raise if retryable_error?(e)

      Rails.logger.error("[AudioGenerationJob] step=#{route_step_id} #{e.class}: #{e.message}\n  #{e.backtrace&.first(3)&.join("\n  ")}")
      if step
        Turbo::StreamsChannel.broadcast_replace_to(
          "step_content_#{step.id}",
          target: "audio-player-#{step.id}",
          partial: "content_engine/audio/generation_failed",
          locals: { step: step, error: e.message }
        )
      end
    end

    private

    def retryable_error?(error)
      error.is_a?(Net::OpenTimeout) ||
        error.is_a?(Net::ReadTimeout) ||
        error.is_a?(Errno::ECONNRESET) ||
        error.is_a?(AiOrchestrator::AiClient::RequestError)
    end
  end
end
