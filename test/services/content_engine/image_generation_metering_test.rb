require "test_helper"

class ContentEngine::ImageGenerationMeteringTest < ActiveSupport::TestCase
  setup do
    @original_openai_key = ENV["OPENAI_API_KEY"]
    ENV["OPENAI_API_KEY"] = "test-key"
    Rails.cache.clear
    @user = create_test_user
  end

  teardown do
    ENV["OPENAI_API_KEY"] = @original_openai_key
  end

  test "persists and prices provider image usage rather than prompt length" do
    stub_request(:post, "https://api.openai.com/v1/images/generations").to_return(
      status: 200,
      body: {
        data: [{ b64_json: Base64.strict_encode64("image") }],
        usage: {
          input_tokens: 70, output_tokens: 1_056,
          input_tokens_details: { text_tokens: 60, image_tokens: 10 }
        }
      }.to_json,
      headers: { "Content-Type" => "application/json" }
    )

    ContentEngine::ImageGenerationService.new(user: @user).generate(image_description: "diagram")

    interaction = AiOrchestrator::AiInteraction.find_by!(model: "gpt-image-1")
    assert_equal 60, interaction.input_tokens
    assert_equal 1_056, interaction.output_tokens
    assert_equal 10, interaction.metadata["image_input_tokens"]
    assert_equal 42_640, interaction.cost_microcents
    assert_equal "priced", interaction.pricing_status
  end

  test "post-provider storage failure leaves exactly one priced interaction" do
    stub_successful_image
    service = ContentEngine::ImageGenerationService.new(user: @user)
    service.define_singleton_method(:resolve_image_url) { |*| raise "storage failed" }

    assert_raises(RuntimeError) { service.generate(image_description: "diagram") }

    rows = AiOrchestrator::AiInteraction.where(model: "gpt-image-1")
    assert_equal 1, rows.count
    assert_equal ["priced", 42_640], [rows.first.pricing_status, rows.first.cost_microcents]
  end

  test "post-provider decoding failure leaves exactly one priced interaction" do
    stub_successful_image
    service = ContentEngine::ImageGenerationService.new(user: @user)
    service.define_singleton_method(:resolve_image_url) { |*| raise ArgumentError, "decode failed" }

    assert_raises(ArgumentError) { service.generate(image_description: "diagram") }

    rows = AiOrchestrator::AiInteraction.where(model: "gpt-image-1")
    assert_equal 1, rows.count
    assert_equal ["priced", 42_640], [rows.first.pricing_status, rows.first.cost_microcents]
  end

  private

  def stub_successful_image
    stub_request(:post, "https://api.openai.com/v1/images/generations").to_return(
      status: 200,
      body: {
        data: [{ b64_json: Base64.strict_encode64("image") }],
        usage: {
          input_tokens: 70, output_tokens: 1_056,
          input_tokens_details: { text_tokens: 60, image_tokens: 10 }
        }
      }.to_json,
      headers: { "Content-Type" => "application/json" }
    )
  end
end
