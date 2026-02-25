module ContentEngine
  class VoiceEvaluationJob < ApplicationJob
    queue_as :default

    def perform(voice_response_id)
      voice_response = Assessments::VoiceResponse.find(voice_response_id)
      step = voice_response.route_step
      VoiceEvaluator.evaluate!(voice_response)

      Turbo::StreamsChannel.broadcast_replace_to(
        "step_content_#{step.id}",
        target: "voice-interaction-#{step.id}",
        partial: "assessments/voice_responses/evaluation_result",
        locals: { voice_response: voice_response }
      )
    rescue => e
      Rails.logger.error("VoiceEvaluationJob failed for voice_response #{voice_response_id}: #{e.message}")
      if voice_response&.route_step_id
        Turbo::StreamsChannel.broadcast_replace_to(
          "step_content_#{voice_response.route_step_id}",
          target: "voice-interaction-#{voice_response.route_step_id}",
          partial: "assessments/voice_responses/evaluation_failed",
          locals: { voice_response: voice_response, error: e.message }
        )
      end
    end
  end
end
