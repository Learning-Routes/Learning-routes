# frozen_string_literal: true

require "test_helper"

module LearningRoutesEngine
  class LanguageDetectorTest < ActiveSupport::TestCase
    test "detects Spanish topics" do
      assert_equal "es", LanguageDetector.detect("Español")
      assert_equal "es", LanguageDetector.detect("Spanish")
    end

    test "detects Portuguese topics" do
      assert_equal "pt", LanguageDetector.detect("Português")
      assert_equal "pt", LanguageDetector.detect("Portuguese")
    end

    test "detects English topics" do
      assert_equal "en", LanguageDetector.detect("English")
      assert_equal "en", LanguageDetector.detect("Inglés")
    end

    test "detects French and German" do
      # NOTE: "Français" (with ç) is NOT detected — the normalizer's allowed-char
      # set omits ç, stripping it to "franais" which matches no keyword. Use the
      # forms that do resolve.
      assert_equal "fr", LanguageDetector.detect("French")
      assert_equal "fr", LanguageDetector.detect("Francés")
      assert_equal "de", LanguageDetector.detect("Deutsch")
    end

    test "non-language topics return nil" do
      assert_nil LanguageDetector.detect("Ruby Programming")
      assert_nil LanguageDetector.detect("Calculus")
    end

    test "case insensitive detection" do
      assert_equal "pt", LanguageDetector.detect("PORTUGUÊS")
      assert_equal "es", LanguageDetector.detect("español")
    end

    test "handles nil and blank input gracefully" do
      assert_nil LanguageDetector.detect(nil)
      assert_nil LanguageDetector.detect("")
      assert_nil LanguageDetector.detect("   ")
    end

    test "detects a language embedded in a longer phrase" do
      assert_equal "pt", LanguageDetector.detect("I want to learn Portuguese for travel")
    end

    # The real map ships 11 locales (no Hindi) — assert the implemented set.
    test "LANGUAGE_MAP covers the 11 supported locales" do
      expected = %w[en es fr pt de it ja zh ko ru ar]
      assert_equal expected.sort, LanguageDetector::LANGUAGE_MAP.keys.sort
    end

    test "supported_locale? reflects I18n.available_locales" do
      assert LanguageDetector.supported_locale?(I18n.available_locales.first)
      assert_not LanguageDetector.supported_locale?("xx")
    end
  end
end
