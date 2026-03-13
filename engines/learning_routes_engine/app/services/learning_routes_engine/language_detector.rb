# frozen_string_literal: true

module LearningRoutesEngine
  class LanguageDetector
    # Maps topic strings (in multiple languages) to locale codes.
    # Only languages with a supported locale get a target_locale;
    # unsupported languages (e.g. japanese) are detected but mapped to nil.
    LANGUAGE_MAP = {
      # English
      "en" => %w[english inglés ingles],
      # Spanish
      "es" => %w[español espanol spanish],
      # French
      "fr" => %w[french français francais francés frances],
      # Portuguese
      "pt" => %w[portuguese portugués portugues português],
      # German
      "de" => %w[german deutsch alemán aleman],
      # Italian
      "it" => %w[italian italiano],
      # Japanese
      "ja" => %w[japanese japonés japones 日本語],
      # Chinese
      "zh" => %w[chinese chino 中文],
      # Korean
      "ko" => %w[korean coreano 한국어],
      # Russian
      "ru" => %w[russian ruso],
      # Arabic
      "ar" => %w[arabic árabe arabe]
    }.freeze

    # Inverted lookup: keyword → locale code
    KEYWORD_TO_LOCALE = LANGUAGE_MAP.each_with_object({}) do |(locale, keywords), map|
      keywords.each { |kw| map[kw] = locale }
    end.freeze

    # Detect if a topic string refers to a language.
    # Returns the target locale code (e.g. "en", "es") or nil.
    def self.detect(topic)
      return nil if topic.blank?

      normalized = topic.to_s.strip.downcase
        .gsub(/[^a-záéíóúüñàèìòùâêîôûäëïöü\p{Han}\p{Hangul}\p{Hiragana}\p{Katakana}\s]/, "")
        .strip

      # Check each keyword against the normalized topic
      KEYWORD_TO_LOCALE.each do |keyword, locale|
        return locale if normalized.include?(keyword)
      end

      nil
    end

    # Returns true if the detected language has a supported I18n locale
    def self.supported_locale?(locale_code)
      I18n.available_locales.map(&:to_s).include?(locale_code.to_s)
    end
  end
end
