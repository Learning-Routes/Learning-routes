require "test_helper"

module ContentEngine
  class VoiceCatalogTest < ActiveSupport::TestCase
    test "VOICE_MAP covers every locale LanguageDetector knows" do
      detector_locales = LearningRoutesEngine::LanguageDetector::LANGUAGE_MAP.keys
      missing = detector_locales - VoiceCatalog::VOICE_MAP.keys
      assert_empty missing, "VoiceCatalog missing entries for: #{missing.join(", ")}"
    end

    test "voice_for resolves mapped locales without falling back" do
      assert_equal VoiceCatalog::VOICE_MAP["es"], VoiceCatalog.voice_for("es")
      assert_equal VoiceCatalog::VOICE_MAP["pt"], VoiceCatalog.voice_for("pt")
    end

    test "voice_for normalizes locale variants" do
      assert_equal VoiceCatalog::VOICE_MAP["en"], VoiceCatalog.voice_for("EN")
      assert_equal VoiceCatalog::VOICE_MAP["en"], VoiceCatalog.voice_for("en-US")
    end

    test "voice_for returns the default voice for unmapped locales" do
      assert_equal VoiceCatalog.default_voice, VoiceCatalog.voice_for("xx")
    end

    test "voice_for returns a default for blank/nil locale rather than crashing" do
      assert_kind_of String, VoiceCatalog.voice_for(nil)
      assert_kind_of String, VoiceCatalog.voice_for("")
    end

    test "fallback_needed? is true when the selected voice differs from default" do
      assert VoiceCatalog.fallback_needed?(VoiceCatalog::VOICE_MAP["es"])
    end

    test "fallback_needed? is false when the selected voice is already the default" do
      refute VoiceCatalog.fallback_needed?(VoiceCatalog.default_voice)
    end
  end
end
