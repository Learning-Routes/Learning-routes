module ContentEngine
  class AudioGenerator
    def self.generate!(route_step)
      new(route_step).generate!
    end

    def initialize(route_step)
      @step = route_step
      @route = route_step.learning_route
      @profile = @route.learning_profile
      @user = @profile&.user
    end

    def generate!
      content = find_or_create_content!
      return content if content.audio_ready?

      content.mark_audio_generating!

      narration = generate_narration_script
      audio_path = synthesize_audio(narration["narration_script"])
      content.mark_audio_ready!(audio_path, narration["estimated_duration_seconds"])

      content.update!(
        audio_transcript: narration["narration_script"],
        metadata: (content.metadata || {}).merge(
          "narration" => {
            "title" => narration["title"],
            "summary" => narration["summary"],
            "key_points" => narration["key_points"],
            "discussion_questions" => narration["discussion_questions"]
          }
        )
      )

      content
    rescue => e
      content&.mark_audio_failed!
      raise e
    end

    private

    def find_or_create_content!
      @step.ai_contents.first || ContentEngine::AiContent.create!(
        route_step_id: @step.id,
        content_type: "text",
        body: @step.description.presence || @step.title,
        audio_status: "pending"
      )
    end

    def generate_narration_script
      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :voice_narration,
        variables: {
          route_topic: @route.topic,
          step_title: @step.title,
          step_description: @step.description.to_s,
          student_level: @profile&.current_level || "beginner",
          content_type: @step.content_type,
          locale: @route.locale || "en",
          estimated_minutes: @step.estimated_minutes || 5
        },
        user: @user,
        async: false
      )

      unless interaction.completed?
        raise "Narration script generation failed: #{interaction.error_message}"
      end

      parse_json_response(interaction.response)
    end

    def synthesize_audio(script_text)
      voice_id = select_voice

      client = AiOrchestrator::AiClient.new(
        model: "elevenlabs",
        task_type: :voice_narration,
        user: @user
      )

      result = client.chat(
        prompt: script_text,
        params: { voice_id: voice_id, model_id: "eleven_multilingual_v2" }
      )

      store_audio_file(result[:content])
    end

    def select_voice
      locale = @route.locale || "en"

      if locale.start_with?("es")
        Rails.application.credentials.dig(:elevenlabs, :spanish_voice_id) ||
          Rails.application.credentials.dig(:elevenlabs, :default_voice_id)
      else
        Rails.application.credentials.dig(:elevenlabs, :default_voice_id)
      end
    end

    def store_audio_file(audio_data)
      dir = Rails.root.join("storage", "audio")
      FileUtils.mkdir_p(dir)

      filename = "step_#{@step.id}_#{Time.current.to_i}.mp3"
      path = dir.join(filename)
      File.binwrite(path, audio_data)

      "/storage/audio/#{filename}"
    end

    def parse_json_response(response_text)
      json_match = response_text.to_s.match(/\{[\s\S]*\}/)
      return {} unless json_match

      JSON.parse(json_match[0])
    rescue JSON::ParserError
      { "narration_script" => response_text }
    end
  end
end
