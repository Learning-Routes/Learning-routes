module ContentEngine
  class AudioGenerationJob < ApplicationJob
    queue_as :default
    retry_on StandardError, wait: 10.seconds, attempts: 3

    def perform(route_step_id)
      step = LearningRoutesEngine::RouteStep.find(route_step_id)

      generator = ContentEngine::AudioGenerator.new(step)
      ai_content = generator.generate!

      # Broadcast audio ready state via Turbo Stream
      Turbo::StreamsChannel.broadcast_replace_to(
        "step_content_#{step.id}",
        target: "audio-player-#{step.id}",
        partial: "content_engine/audio/player",
        locals: { step: step, ai_content: ai_content }
      )
    rescue ContentEngine::AudioGenerator::GenerationError => e
      Rails.logger.error("[AudioGenerationJob] Step #{route_step_id}: #{e.message}")

      # Broadcast failure state
      Turbo::StreamsChannel.broadcast_replace_to(
        "step_content_#{route_step_id}",
        target: "audio-player-#{route_step_id}",
        partial: "content_engine/audio/generation_failed",
        locals: { step_id: route_step_id, error: e.message }
      )
    end
  end
end
