# frozen_string_literal: true

module ContentEngine
  class SectionAudioGenerationJob < ApplicationJob
    queue_as :default

    retry_on Net::OpenTimeout, Net::ReadTimeout, Errno::ECONNRESET,
             wait: :polynomially_longer, attempts: 3

    def perform(step_id, section_index, section_text, locale)
      result = SectionAudioGenerator.generate!(
        step_id, section_index, section_text, locale: locale
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
    rescue Net::OpenTimeout, Net::ReadTimeout, Errno::ECONNRESET
      raise # Let retry_on handle transient network errors
    rescue => e
      Rails.logger.error("[SectionAudioGenerationJob] Failed for step #{step_id}, section #{section_index}: #{e.message}")
      # Broadcast error state so the UI doesn't poll forever
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
  end
end
