# frozen_string_literal: true

module ContentEngine
  class SectionAudioGenerationJob < ApplicationJob
    queue_as :default

    retry_on Net::OpenTimeout, Net::ReadTimeout, Errno::ECONNRESET,
             wait: :polynomially_longer, attempts: 3

    # See AudioGenerationJob — same bounded retry for ElevenLabs RequestError.
    retry_on AiOrchestrator::AiClient::RequestError,
             wait: :polynomially_longer, attempts: 2

    def perform(step_id, section_index, section_text, locale, target_locale = nil)
      tl = target_locale.present? ? target_locale : nil

      result = SectionAudioGenerator.generate!(
        step_id, section_index, section_text,
        locale: locale, target_locale: tl
      )

      if result
        Turbo::StreamsChannel.broadcast_replace_to(
          "step_content_#{step_id}",
          target: "section-audio-#{step_id}-#{section_index}",
          partial: "learning_routes_engine/steps/lesson_sections/section_audio_player",
          locals: {
            step_id: step_id,
            section_index: section_index,
            section_text: section_text,
            audio_url: result[:audio_url],
            duration: result[:duration]
          }
        )
      end
    rescue => e
      raise if retryable_error?(e)

      Rails.logger.error("[SectionAudioGenerationJob] step=#{step_id} section=#{section_index} #{e.class}: #{e.message}\n  #{e.backtrace&.first(3)&.join("\n  ")}")

      # Record the failure reason in metadata so the UI and operators can see why.
      begin
        step = LearningRoutesEngine::RouteStep.find(step_id)
        metadata = step.metadata || {}
        audio_sections = metadata["audio_sections"] || {}
        audio_sections[section_index.to_s] = {
          "status" => "failed",
          "error" => e.message.to_s.truncate(300)
        }
        step.update!(metadata: metadata.merge("audio_sections" => audio_sections))
      rescue
        nil
      end

      Turbo::StreamsChannel.broadcast_replace_to(
        "step_content_#{step_id}",
        target: "section-audio-#{step_id}-#{section_index}",
        partial: "learning_routes_engine/steps/lesson_sections/section_audio_player",
        locals: {
          step_id: step_id,
          section_index: section_index,
          section_text: section_text
        }
      )
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
