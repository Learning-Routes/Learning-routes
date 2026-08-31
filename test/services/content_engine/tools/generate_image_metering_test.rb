require "test_helper"

class ContentEngine::Tools::GenerateImageMeteringTest < ActiveSupport::TestCase
  setup do
    @client = Object.new
    @client.define_singleton_method(:chat) do |**|
      {
        content: "aW1hZ2U=", content_type: "image/png",
        input_tokens: 100, image_input_tokens: 200, output_tokens: 300,
        latency_ms: 9
      }
    end
    singleton = AiOrchestrator::AiClient.singleton_class
    singleton.alias_method :_original_new_for_image_tool_test, :new
    client = @client
    AiOrchestrator::AiClient.define_singleton_method(:new) { |**| client }
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
