require "test_helper"

module AiOrchestrator
  class LanguageInstructionsTest < ActiveSupport::TestCase
    test "directive returns the monolingual block when target_locale is blank" do
      d = LanguageInstructions.directive(content_locale: "es", target_locale: nil)
      assert_includes d, "MONOLINGUAL"
      assert_includes d, "Spanish"
      refute_includes d, "BILINGUAL"
    end

    test "directive returns the monolingual block when target equals content locale" do
      d = LanguageInstructions.directive(content_locale: "en", target_locale: "en")
      assert_includes d, "MONOLINGUAL"
    end

    test "directive returns the bilingual block when target differs" do
      d = LanguageInstructions.directive(content_locale: "es", target_locale: "pt")
      assert_includes d, "BILINGUAL"
      assert_includes d, "Spanish", "must name the student's native language"
      assert_includes d, "Portuguese", "must name the language being taught"
      assert_includes d, "NEVER produce a lesson that contains no Portuguese content"
    end

    test "language_name resolves all LanguageDetector locale codes" do
      LearningRoutesEngine::LanguageDetector::LANGUAGE_MAP.keys.each do |code|
        name = LanguageInstructions.language_name(code)
        assert_kind_of String, name
        assert_not_equal code.upcase, name, "expected human name for #{code}, got code"
      end
    end

    test "language_name falls back to a sensible default for unknown codes" do
      assert_equal "XX", LanguageInstructions.language_name("xx")
      assert_equal "English", LanguageInstructions.language_name(nil)
    end

    test "bilingual? predicate" do
      assert LanguageInstructions.bilingual?(content_locale: "es", target_locale: "pt")
      refute LanguageInstructions.bilingual?(content_locale: "es", target_locale: "es")
      refute LanguageInstructions.bilingual?(content_locale: "es", target_locale: nil)
      refute LanguageInstructions.bilingual?(content_locale: "es", target_locale: "")
    end
  end
end
