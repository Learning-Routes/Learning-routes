# frozen_string_literal: true

module ContentEngine
  module Tools
    class AudioNarration < RubyLLM::Tool
      description "Generates an audio narration of text using text-to-speech. " \
                  "Use this when the user wants to hear content spoken aloud, " \
                  "needs an audio version of a lesson section, or when audio would enhance learning."

      param :text, desc: "The text to convert to speech audio (max 5000 characters)"
      param :voice_id, desc: "ElevenLabs voice ID (optional, uses default)", required: false

      def execute(text:, voice_id: nil)
        truncated = text.to_s.first(5000)

        user = Thread.current[:lesson_agent_user]
        params = {}
        params[:voice_id] = voice_id if voice_id.present?

        client = AiOrchestrator::AiClient.new(
          model: "elevenlabs",
          task_type: :voice_narration,
          user: user
        )

        result = client.chat(prompt: truncated, params: params)

        dir = Rails.root.join("storage", "audio")
        FileUtils.mkdir_p(dir)
        filename = "narration_#{SecureRandom.hex(8)}.mp3"
        path = dir.join(filename)
        File.binwrite(path, result[:content])

        halt "/storage/audio/#{filename}"
      rescue => e
        "Could not generate audio: #{e.message}"
      end
    end
  end
end
