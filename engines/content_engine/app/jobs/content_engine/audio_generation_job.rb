module ContentEngine
  class AudioGenerationJob < ApplicationJob
    queue_as :default

    retry_on Net::OpenTimeout, Net::ReadTimeout, Errno::ECONNRESET,
             wait: :polynomially_longer, attempts: 3

    def perform(route_step_id)
      step = LearningRoutesEngine::RouteStep.find(route_step_id)
      content = AudioGenerator.generate!(step)

      Turbo::StreamsChannel.broadcast_replace_to(
        "step_content_#{step.id}",
        target: "audio-player-#{step.id}",
        partial: "content_engine/audio/player",
        locals: { step: step, ai_content: content }
      )
    rescue Net::OpenTimeout, Net::ReadTimeout, Errno::ECONNRESET
      raise # Let retry_on handle transient network errors
    rescue => e
      Rails.logger.error("AudioGenerationJob failed for step #{route_step_id}: #{e.message}")
      if step
        Turbo::StreamsChannel.broadcast_replace_to(
          "step_content_#{step.id}",
          target: "audio-player-#{step.id}",
          partial: "content_engine/audio/generation_failed",
          locals: { step: step, error: e.message }
        )
      end
    end
  end
end
