module ContentEngine
  # Single source of truth for ElevenLabs voice selection.
  #
  # Previously duplicated across AudioGenerator and SectionAudioGenerator,
  # with gaps: LanguageDetector knows 11 languages (en, es, fr, pt, de, it, ja,
  # zh, ko, ru, ar) but only 4 had dedicated voices — the rest silently fell
  # back to an English voice, which sounds wrong when narrating e.g. Japanese.
  #
  # ElevenLabs' multilingual_v2 model lets any voice speak any supported
  # language, so we route unmapped locales through a neutral multilingual
  # voice (Antoni) and log it, rather than handing them an English-native voice.
  module VoiceCatalog
    # Voice IDs — overridable via credentials (elevenlabs.voices.{locale_sym}).
    VOICE_MAP = {
      "en" => "21m00Tcm4TlvDq8ikWAM", # Rachel — English
      "es" => "XrExE9yKIg1WjnnlVkGX", # Matilda — Spanish
      "fr" => "XB0fDUnXU5powFXDhCwa", # Charlotte — French
      "pt" => "ErXwobaYiN019PkySvjV", # Antoni — Portuguese (multilingual)
      # Unmapped languages use the multilingual fallback voice below and
      # get a logged warning so we know to upgrade coverage later.
      "de" => "ErXwobaYiN019PkySvjV",
      "it" => "ErXwobaYiN019PkySvjV",
      "ja" => "ErXwobaYiN019PkySvjV",
      "zh" => "ErXwobaYiN019PkySvjV",
      "ko" => "ErXwobaYiN019PkySvjV",
      "ru" => "ErXwobaYiN019PkySvjV",
      "ar" => "ErXwobaYiN019PkySvjV"
    }.freeze

    # Used when no credential override, no VOICE_MAP hit, and no credential default.
    DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"

    module_function

    # Resolve the voice to use for a given locale. Priority:
    # 1. credentials.elevenlabs.voices[:locale_sym] (explicit override)
    # 2. VOICE_MAP[locale]
    # 3. credentials.elevenlabs.default_voice_id
    # 4. DEFAULT_VOICE
    #
    # Logs a warning only when falling through all mappings to the default —
    # that signals an unconfigured locale we should add to VOICE_MAP.
    def voice_for(locale)
      key = normalize(locale)

      if (override = credentials_voice(key))
        return override
      end

      if (mapped = VOICE_MAP[key])
        return mapped
      end

      fallback = default_voice
      Rails.logger.warn("[VoiceCatalog] No voice for locale '#{locale}' — using default #{fallback}. Add an entry to VOICE_MAP or credentials.elevenlabs.voices.")
      fallback
    end

    # The voice to retry with when the selected voice fails.
    # Caller is expected to check `fallback_needed?` first.
    def default_voice
      Rails.application.credentials.dig(:elevenlabs, :default_voice_id) || DEFAULT_VOICE
    end

    # Returns true if a retry with `default_voice` would actually change voices.
    def fallback_needed?(voice_id)
      voice_id.to_s != default_voice
    end

    def normalize(locale)
      # locale.to_s.split("-").first returns nil for "" — guard with safe-nav
      # so blank/nil inputs don't crash and instead fall back to English.
      locale.to_s.split("-").first&.downcase&.presence || "en"
    end

    def credentials_voice(key)
      Rails.application.credentials.dig(:elevenlabs, :voices, key.to_sym)
    end
  end
end
