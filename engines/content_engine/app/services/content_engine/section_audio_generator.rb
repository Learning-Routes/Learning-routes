# frozen_string_literal: true

module ContentEngine
  class SectionAudioGenerator
    CACHE_TTL = 30.days

    # Voice IDs for ElevenLabs — overridable via credentials (elevenlabs.voices.{locale})
    VOICE_MAP = {
      "es" => "XrExE9yKIg1WjnnlVkGX", # Matilda — warm, young, Spanish
      "pt" => "ErXwobaYiN019PkySvjV", # Antoni — multilingual, Portuguese
      "fr" => "XB0fDUnXU5powFXDhCwa", # Charlotte — multilingual, French
      "en" => "21m00Tcm4TlvDq8ikWAM"  # Rachel — calm, young, English
    }.freeze

    DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"

    def self.generate!(step_id, section_index, section_text, locale: "en", target_locale: nil)
      new(step_id, section_index, section_text, locale: locale, target_locale: target_locale).generate!
    end

    def initialize(step_id, section_index, section_text, locale: "en", target_locale: nil)
      @step_id = step_id
      @section_index = section_index
      @section_text = section_text
      @locale = locale
      @target_locale = target_locale
    end

    def generate!
      sanitized = sanitize_for_tts(@section_text)
      return nil if sanitized.blank?

      audio_path = synthesize_audio(sanitized)
      duration = estimate_duration(sanitized)

      cache_key = self.class.cache_key(@step_id, @section_index)
      Rails.cache.write(cache_key, { audio_url: audio_path, duration: duration }, expires_in: CACHE_TTL)

      # Update step metadata audio_sections status
      update_step_audio_status!("ready", audio_path, duration)

      { audio_url: audio_path, duration: duration }
    end

    def self.cache_key(step_id, section_index)
      "section_audio:#{step_id}:#{section_index}"
    end

    def self.cached(step_id, section_index)
      result = Rails.cache.read(cache_key(step_id, section_index))
      if result
        file_path = Rails.root.join(result[:audio_url].to_s.delete_prefix("/"))
        if File.exist?(file_path) && File.size(file_path) > 1024
          return result
        else
          Rails.cache.delete(cache_key(step_id, section_index))
        end
      end

      # Fallback: check disk for existing audio files
      dir = Rails.root.join("storage", "audio", "sections")
      pattern = dir.join("section_#{step_id}_#{section_index}_*.mp3")
      files = Dir.glob(pattern).sort
      valid_files = files.select { |f| File.size(f) > 1024 }
      if valid_files.any?
        file_path = valid_files.last
        audio_url = "/storage/audio/sections/#{File.basename(file_path)}"
        duration = 60.0 # rough estimate
        data = { audio_url: audio_url, duration: duration }
        Rails.cache.write(cache_key(step_id, section_index), data, expires_in: CACHE_TTL)
        data
      end
    end

    private

    def sanitize_for_tts(text)
      sanitized = text.dup

      # Remove Mermaid diagram blocks → spoken placeholder
      sanitized.gsub!(/```mermaid\n.*?```/m, locale_diagram_placeholder)

      # Remove other code blocks → spoken placeholder
      sanitized.gsub!(/```[\w]*\n.*?```/m, locale_code_placeholder)

      # Remove inline code backticks (keep the text inside)
      sanitized.gsub!(/`([^`]+)`/) { Regexp.last_match(1) }

      # Remove markdown tables
      sanitized.gsub!(/^\|.*\|$/m, "")
      sanitized.gsub!(/^[\s|:-]+$/m, "")

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

      # Strip emoji (Unicode emoji ranges)
      sanitized.gsub!(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/, "")

      # Locale-specific number/currency pronunciation
      if spanish_locale?
        sanitized.gsub!(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/) { "#{Regexp.last_match(1)} dólares" }
        sanitized.gsub!(/(\d+)%/) { "#{Regexp.last_match(1)} por ciento" }
      end

      # Convert bullet points to natural speech pauses
      sanitized.gsub!(/^[-*]\s+/, "... ")

      # Convert numbered lists to natural flow
      sanitized.gsub!(/^\d+\.\s+/, "... ")

      # Double newlines → pause marker
      sanitized.gsub!(/\n{2,}/, ". ")

      # Single newlines → space
      sanitized.gsub!(/\n/, " ")

      # Collapse multiple spaces/periods
      sanitized.gsub!(/\s{2,}/, " ")
      sanitized.gsub!(/\.{2,}/, ".")

      sanitized.strip
    end

    def locale_code_placeholder
      spanish_locale? ? "... código omitido ..." : "... code omitted ..."
    end

    def locale_diagram_placeholder
      spanish_locale? ? "... ver diagrama en pantalla ..." : "... see diagram on screen ..."
    end

    def spanish_locale?
      @locale&.start_with?("es")
    end

    def bilingual_route?
      @target_locale.present?
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

      # Always use multilingual_v2 — handles single-language fine and
      # is required for bilingual language-learning routes (Strategy A).
      # The narration text already mixes both languages from the bilingual prompt.
      result = client.chat(
        prompt: text,
        params: {
          voice_id: voice_id,
          model_id: "eleven_multilingual_v2"
        }
      )

      # Track cost
      track_audio_cost!(user, text.length, result[:latency_ms])

      store_audio_file(result[:content])
    end

    def select_voice
      lang = effective_voice_locale
      # Priority: credentials → VOICE_MAP → default
      Rails.application.credentials.dig(:elevenlabs, :voices, lang.to_sym) ||
        VOICE_MAP[lang] ||
        Rails.application.credentials.dig(:elevenlabs, :default_voice_id) ||
        DEFAULT_VOICE
    end

    # For bilingual routes, pick a voice matching the target language
    # since the educational content emphasizes the target language.
    # For regular routes, use the content locale.
    def effective_voice_locale
      if bilingual_route?
        @target_locale.to_s.split("-").first
      else
        @locale&.split("-")&.first || "en"
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

    def estimate_duration(text)
      word_count = text.split(/\s+/).size
      (word_count / 150.0 * 60).round(1)
    end

    def track_audio_cost!(user, text_length, latency_ms)
      AiOrchestrator::AiInteraction.create!(
        user: user,
        model: "elevenlabs",
        task_type: "voice_narration",
        prompt: "section_audio:#{@step_id}:#{@section_index}",
        status: :completed,
        response: "audio_generated",
        input_tokens: text_length,
        output_tokens: 0,
        latency_ms: latency_ms || 0,
        cost_cents: AiOrchestrator::CostTracker.estimate_cost(model: "elevenlabs")
      )
    rescue => e
      Rails.logger.warn("[SectionAudioGenerator] Cost tracking failed: #{e.message}")
    end

    def update_step_audio_status!(status, url = nil, duration = nil)
      step = LearningRoutesEngine::RouteStep.find(@step_id)
      metadata = step.metadata || {}
      audio_sections = metadata["audio_sections"] || {}

      entry = { "status" => status }
      entry["url"] = url if url
      entry["duration"] = duration if duration
      audio_sections[@section_index.to_s] = entry

      step.update!(metadata: metadata.merge("audio_sections" => audio_sections))
    rescue => e
      Rails.logger.warn("[SectionAudioGenerator] Status update failed: #{e.message}")
    end
  end
end
