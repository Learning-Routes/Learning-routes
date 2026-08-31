require "test_helper"

class ContentEngine::VoiceEvaluatorMeteringTest < ActiveSupport::TestCase
  setup do
    @audio_dir = Rails.root.join("storage", "voice_responses")
    FileUtils.mkdir_p(@audio_dir)
    File.binwrite(@audio_dir.join("metering.mp3"), "audio")
    @user = create_test_user
    response = Struct.new(:audio_blob_key, :user).new("metering.mp3", @user)
    @evaluator = ContentEngine::VoiceEvaluator.allocate
    @evaluator.instance_variable_set(:@response, response)
    @evaluator.define_singleton_method(:audio_duration_seconds) { |_path| BigDecimal("60.0") }
  end

  teardown do
    FileUtils.rm_f(@audio_dir.join("metering.mp3"))
  end

  test "requests scribe v2 and records a separate exact transcription cost" do
    request = stub_request(:post, "https://api.elevenlabs.io/v1/speech-to-text")
      .to_return(status: 200, body: { text: "transcribed" }.to_json)

    assert_equal "scribe_v2", ContentEngine::VoiceEvaluator::STT_MODEL
    assert_equal "transcribed", @evaluator.send(:transcribe_audio)
    assert_requested request
    row = AiOrchestrator::AiInteraction.find_by!(model: "scribe_v2")
    assert_equal 60_000, row.provider_units
    assert_equal 3_667, row.cost_microcents
    assert_equal "transcription", row.task_type
  end
end
