require "test_helper"

# STEP 39 §0 row 2: the landing listed "Claude" although no task is ever sent to
# it. Every provider the landing names must be one the app really calls: a model
# AiClient accepts AND that production code uses — a ModelRouter route or a
# direct AiClient.new(model: …) outside the tests.
class LandingIntegrationsTest < ActiveSupport::TestCase
  PROVIDER_MODELS = {
    "OpenAI" => /\Agpt-(?!image)/,
    "GPT Image" => /\Agpt-image-/,
    "ElevenLabs" => /\Aelevenlabs\z/,
    "Claude" => /\Aclaude-/
  }.freeze

  test "every provider on the landing is one the app calls, in both locales" do
    used = used_models

    %i[es en].each do |locale|
      names = I18n.t("integrations.items", locale: locale).map { |item| item[:name] }
      assert names.any?, "#{locale}: the landing names no provider"

      names.each do |name|
        pattern = PROVIDER_MODELS.fetch(name) { flunk "#{locale}: map #{name.inspect} to its models in this test" }
        assert used.any? { |model| model.match?(pattern) },
          "#{locale}: the landing names #{name}, but no production code sends it anything (used: #{used.sort.join(', ')})"
      end
    end
  end

  private

  def used_models
    accepted = AiOrchestrator::AiClient::RUBY_LLM_MODELS + AiOrchestrator::AiClient::GPT_IMAGE_MODELS + ["elevenlabs"]
    routed = AiOrchestrator::ModelRouter::ROUTING_TABLE.values.flat_map(&:values)
    direct = Dir[Rails.root.join("{app,engines/*/app}/**/*.rb")].flat_map do |path|
      File.read(path).scan(/AiClient\.new\(\s*model: "([^"]+)"/).flatten
    end
    (routed + direct).uniq & accepted
  end
end
