# frozen_string_literal: true

require "test_helper"

class ContentEngine::Tools::AudioNarrationTest < ActiveSupport::TestCase
  setup do
    @tool = ContentEngine::Tools::AudioNarration.new
    @audio_dir = Rails.root.join("storage", "audio")
  end

  teardown do
    restore_ai_client_new!
    # Clean up any test-generated audio files
    FileUtils.rm_rf(@audio_dir) if @audio_dir.exist?
  end

  test "returns audio file path on success" do
    mock_client = build_mock_client

    stub_ai_client_with(mock_client)

    result = execute_tool(text: "Test text")
    assert_match %r{/storage/audio/narration_\w+\.mp3}, result
  end

  test "writes binary audio data to file" do
    mock_client = build_mock_client(content: "fake-audio-binary-data")

    stub_ai_client_with(mock_client)

    result = execute_tool(text: "Test text")
    # Extract filename from result path
    filename = File.basename(result)
    path = @audio_dir.join(filename)

    assert path.exist?, "Audio file should be written to disk"
    assert_equal "fake-audio-binary-data", File.binread(path)
  end

  test "returns error message when ElevenLabs fails" do
    error_client = Object.new
    def error_client.chat(**) = raise(AiOrchestrator::AiClient::RequestError, "ElevenLabs API error: 401")

    stub_ai_client_with(error_client)

    result = execute_tool(text: "Some text to narrate")
    assert_includes result, "Could not generate audio"
  end

  test "truncates text to 5000 characters" do
    long_text = "A" * 6000
    captured_prompt = nil

    mock_client = Object.new
    mock_client.define_singleton_method(:chat) do |prompt:, params: {}|
      captured_prompt = prompt
      {
        content: "fake-audio",
        model: "elevenlabs",
        input_tokens: 100,
        output_tokens: 0,
        latency_ms: 200,
        content_type: "audio/mpeg"
      }
    end

    stub_ai_client_with(mock_client)

    execute_tool(text: long_text)
    assert_equal 5000, captured_prompt.length
  end

  test "passes voice_id in params when provided" do
    captured_params = nil

    mock_client = Object.new
    mock_client.define_singleton_method(:chat) do |prompt:, params: {}|
      captured_params = params
      {
        content: "fake-audio",
        model: "elevenlabs",
        input_tokens: 100,
        output_tokens: 0,
        latency_ms: 200,
        content_type: "audio/mpeg"
      }
    end

    stub_ai_client_with(mock_client)

    execute_tool(text: "Hello", voice_id: "custom-voice-123")
    assert_equal({ voice_id: "custom-voice-123" }, captured_params)
  end

  private

  def execute_tool(**kwargs)
    result = @tool.execute(**kwargs)
    result.is_a?(RubyLLM::Tool::Halt) ? result.content : result
  end

  def build_mock_client(content: "fake-audio-binary-data")
    mock = Object.new
    mock.define_singleton_method(:chat) do |prompt:, params: {}|
      {
        content: content,
        model: "elevenlabs",
        input_tokens: 100,
        output_tokens: 0,
        latency_ms: 500,
        content_type: "audio/mpeg"
      }
    end
    mock
  end

  def stub_ai_client_with(mock_instance)
    unless AiOrchestrator::AiClient.singleton_class.method_defined?(:_original_new_for_audio_test)
      AiOrchestrator::AiClient.singleton_class.alias_method :_original_new_for_audio_test, :new
    end
    AiOrchestrator::AiClient.define_singleton_method(:new) { |**_kwargs| mock_instance }
  end

  def restore_ai_client_new!
    if AiOrchestrator::AiClient.singleton_class.method_defined?(:_original_new_for_audio_test)
      AiOrchestrator::AiClient.singleton_class.alias_method :new, :_original_new_for_audio_test
      AiOrchestrator::AiClient.singleton_class.remove_method :_original_new_for_audio_test
    end
  end
end
