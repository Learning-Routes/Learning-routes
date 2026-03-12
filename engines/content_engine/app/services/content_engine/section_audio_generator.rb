# frozen_string_literal: true

module ContentEngine
  class SectionAudioGenerator
    CACHE_TTL = 30.days

    def self.generate!(step_id, section_index, section_text, locale: "en")
      new(step_id, section_index, section_text, locale: locale).generate!
    end

    def initialize(step_id, section_index, section_text, locale: "en")
      @step_id = step_id
      @section_index = section_index
      @section_text = section_text
      @locale = locale
    end

    def generate!
      sanitized = sanitize_for_tts(@section_text)
      return nil if sanitized.blank?

      audio_path = synthesize_audio(sanitized)
      duration = estimate_duration(sanitized)

      cache_key = self.class.cache_key(@step_id, @section_index)
      Rails.cache.write(cache_key, { audio_url: audio_path, duration: duration }, expires_in: CACHE_TTL)

      { audio_url: audio_path, duration: duration }
    end

    def self.cache_key(step_id, section_index)
      "section_audio:#{step_id}:#{section_index}"
    end

    def self.cached(step_id, section_index)
      result = Rails.cache.read(cache_key(step_id, section_index))
      return result if result

      # Fallback: check disk for existing audio files (cache may have been cleared on restart)
      dir = Rails.root.join("storage", "audio", "sections")
      pattern = dir.join("section_#{step_id}_#{section_index}_*.mp3")
      files = Dir.glob(pattern).sort
      if files.any?
        file_path = files.last
        audio_url = "/storage/audio/sections/#{File.basename(file_path)}"
        word_count = 150 # rough estimate since we don't have text
        duration = (word_count / 150.0 * 60).round(1)
        data = { audio_url: audio_url, duration: duration }
        Rails.cache.write(cache_key(step_id, section_index), data, expires_in: CACHE_TTL)
        data
      end
    end

    private

    def sanitize_for_tts(text)
      sanitized = text.dup

      # Remove code blocks → spoken placeholder
      sanitized.gsub!(/```[\w]*\n.*?```/m, locale_code_placeholder)

      # Remove inline code backticks
      sanitized.gsub!(/`([^`]+)`/) { Regexp.last_match(1) }

      # Remove markdown images
      sanitized.gsub!(/!\[([^\]]*)\]\([^)]+\)/, '\1')

      # Convert links to just link text
      sanitized.gsub!(/\[([^\]]+)\]\([^)]+\)/, '\1')

      # Remove heading markers
      sanitized.gsub!(/^#+\s+/, "")

      # Remove bold/italic markers
      sanitized.gsub!(/\*{1,3}([^*]+)\*{1,3}/, '\1')
      sanitized.gsub!(/_{1,3}([^_]+)_{1,3}/, '\1')

      # Remove horizontal rules
      sanitized.gsub!(/^[-*_]{3,}$/, "")

      # Remove HTML tags
      sanitized.gsub!(/<[^>]+>/, "")

      # Convert bullet points to natural speech pauses
      sanitized.gsub!(/^[-*]\s+/, "... ")

      # Double newlines → pause marker (ElevenLabs respects periods)
      sanitized.gsub!(/\n{2,}/, ". ")

      # Single newlines → space
      sanitized.gsub!(/\n/, " ")

      # Collapse multiple spaces/periods
      sanitized.gsub!(/\s{2,}/, " ")
      sanitized.gsub!(/\.{2,}/, ".")

      sanitized.strip
    end

    def locale_code_placeholder
      @locale&.start_with?("es") ? "código omitido" : "code omitted"
    end

    def synthesize_audio(text)
      voice_id = select_voice
      step = LearningRoutesEngine::RouteStep.find(@step_id)
      user = step.learning_route.learning_profile&.user

      client = AiOrchestrator::AiClient.new(
        model: "elevenlabs",
        task_type: :voice_narration,
        user: user
      )

      result = client.chat(
        prompt: text,
        params: {
          voice_id: voice_id,
          model_id: "eleven_flash_v2_5"
        }
      )

      store_audio_file(result[:content])
    end

    def select_voice
      if @locale&.start_with?("es")
        Rails.application.credentials.dig(:elevenlabs, :spanish_voice_id) ||
          Rails.application.credentials.dig(:elevenlabs, :default_voice_id) ||
          "21m00Tcm4TlvDq8ikWAM"
      else
        Rails.application.credentials.dig(:elevenlabs, :default_voice_id) ||
          "21m00Tcm4TlvDq8ikWAM"
      end
    end

    def store_audio_file(audio_data)
      dir = Rails.root.join("storage", "audio", "sections")
      FileUtils.mkdir_p(dir)

      filename = "section_#{@step_id}_#{@section_index}_#{Time.current.to_i}.mp3"
      path = dir.join(filename)
      File.binwrite(path, audio_data)

      "/storage/audio/sections/#{filename}"
    end

    # Rough estimate: ~150 words per minute for TTS
    def estimate_duration(text)
      word_count = text.split(/\s+/).size
      (word_count / 150.0 * 60).round(1)
    end
  end
end
