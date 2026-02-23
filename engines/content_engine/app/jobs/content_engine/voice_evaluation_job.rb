module ContentEngine
  class VoiceEvaluationJob < ApplicationJob
    queue_as :default
    retry_on StandardError, wait: 5.seconds, attempts: 2

    def perform(voice_response_id)
      voice_response = Assessments::VoiceResponse.find(voice_response_id)

      evaluator = ContentEngine::VoiceEvaluator.new(voice_response)
      result = evaluator.evaluate!

      step = voice_response.route_step

      # Broadcast evaluation result via Turbo Stream
      Turbo::StreamsChannel.broadcast_replace_to(
        "step_content_#{step.id}",
        target: "voice-evaluation-#{voice_response.id}",
        partial: "assessments/voice_responses/evaluation_result",
        locals: { voice_response: result }
      )
    rescue ContentEngine::VoiceEvaluator::EvaluationError => e
      Rails.logger.error("[VoiceEvaluationJob] Response #{voice_response_id}: #{e.message}")

      Turbo::StreamsChannel.broadcast_replace_to(
        "step_content_#{voice_response.route_step_id}",
        target: "voice-evaluation-#{voice_response_id}",
        partial: "assessments/voice_responses/evaluation_failed",
        locals: { error: e.message }
      )
    end
  end
end
