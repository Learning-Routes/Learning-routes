require "test_helper"

class ContentEngine::Tools::GenerateImageMeteringTest < ActiveSupport::TestCase
  setup do
    @provider_result = {
      content: "aW1hZ2U=", content_type: "image/png",
      input_tokens: 100, image_input_tokens: 200, output_tokens: 300,
      latency_ms: 9
    }
    owner = self
    @client = Object.new
    @client.define_singleton_method(:chat) do |**|
      owner.instance_variable_get(:@provider_result)
    end
    singleton = AiOrchestrator::AiClient.singleton_class
    singleton.alias_method :_original_new_for_image_tool_test, :new
    client = @client
    AiOrchestrator::AiClient.define_singleton_method(:new) { |**| client }
  end

  test "formatting failure after provider success leaves one priced interaction" do
    description = Class.new(String) do
      def gsub(*)
        raise "formatting failed"
      end
    end.new("a cell")

    result = ContentEngine::Tools::GenerateImage.new.execute(description: description)

    assert_match(/formatting failed/, result)
    rows = AiOrchestrator::AiInteraction.where(model: "gpt-image-1")
    assert_equal 1, rows.count
    assert_equal ["priced", 14_500], [rows.first.pricing_status, rows.first.cost_microcents]
  end

  test "formatting failure with missing usage leaves one explicitly unpriced interaction" do
    @provider_result = { content: "aW1hZ2U=", content_type: "image/png", latency_ms: 9 }
    description = Class.new(String) do
      def gsub(*)
        raise "formatting failed"
      end
    end.new("a cell")

    ContentEngine::Tools::GenerateImage.new.execute(description: description)

    rows = AiOrchestrator::AiInteraction.where(model: "gpt-image-1")
    assert_equal 1, rows.count
    assert_equal "unpriced", rows.first.pricing_status
    assert_nil rows.first.input_tokens
    assert_nil rows.first.output_tokens
    assert_nil rows.first.metadata["image_input_tokens"]
  end

  teardown do
    singleton = AiOrchestrator::AiClient.singleton_class
    singleton.alias_method :new, :_original_new_for_image_tool_test
    singleton.remove_method :_original_new_for_image_tool_test
  end

  test "image tool persists exact provider-reported usage" do
    ContentEngine::Tools::GenerateImage.new.execute(description: "a cell")

    interaction = AiOrchestrator::AiInteraction.order(:id).last
    assert_equal "gpt-image-1", interaction.model
    assert_equal "priced", interaction.pricing_status
    assert_equal 14_500, interaction.cost_microcents
    assert_equal 200, interaction.metadata["image_input_tokens"]
  end
end
