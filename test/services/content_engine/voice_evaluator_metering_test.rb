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
    assert_equal 1, scribe_rows.count
  end

  test "malformed successful JSON preserves the priced Scribe charge" do
    stub_request(:post, "https://api.elevenlabs.io/v1/speech-to-text")
      .to_return(status: 200, body: "not-json")

    error = assert_raises(ContentEngine::VoiceEvaluator::TranscriptionError) do
      @evaluator.send(:transcribe_audio)
    end

    assert_equal "Malformed Scribe response", error.message
    assert_priced_scribe_row
  end

  test "missing transcription text preserves the priced Scribe charge" do
    stub_request(:post, "https://api.elevenlabs.io/v1/speech-to-text")
      .to_return(status: 200, body: { language: "en" }.to_json)

    error = assert_raises(ContentEngine::VoiceEvaluator::TranscriptionError) do
      @evaluator.send(:transcribe_audio)
    end

    assert_equal "Scribe response missing transcription text", error.message
    assert_priced_scribe_row
  end

  test "downstream evaluation failure does not relabel the successful Scribe charge" do
    stub_request(:post, "https://api.elevenlabs.io/v1/speech-to-text")
      .to_return(status: 200, body: { text: "transcribed" }.to_json)
    response = MeteringResponse.new("metering.mp3", @user)
    evaluator = ContentEngine::VoiceEvaluator.new(response)
    evaluator.define_singleton_method(:audio_duration_seconds) { |_path| BigDecimal("60.0") }
    evaluator.define_singleton_method(:evaluate_response) { |_| raise "downstream failure" }

    assert_raises(RuntimeError) { evaluator.evaluate! }

    assert_priced_scribe_row
    assert_equal "failed", response.status
  end

  test "unknown duration records successful Scribe usage as unpriced" do
    stub_request(:post, "https://api.elevenlabs.io/v1/speech-to-text")
      .to_return(status: 200, body: { text: "transcribed" }.to_json)
    @evaluator.define_singleton_method(:audio_duration_seconds) { |_path| nil }

    assert_equal "transcribed", @evaluator.send(:transcribe_audio)

    row = AiOrchestrator::AiInteraction.find_by!(model: "scribe_v2")
    assert row.completed?
    assert_equal "unpriced", row.pricing_status
    assert_nil row.provider_units
    assert_equal 1, scribe_rows.count
  end

  test "non-2xx provider failure remains failed without response body disclosure" do
    stub_request(:post, "https://api.elevenlabs.io/v1/speech-to-text")
      .to_return(status: 422, body: "secret provider payload")

    error = assert_raises(ContentEngine::VoiceEvaluator::TranscriptionError) do
      @evaluator.send(:transcribe_audio)
    end

    assert_equal "Scribe request failed with HTTP 422", error.message
    row = AiOrchestrator::AiInteraction.find_by!(model: "scribe_v2")
    assert row.failed?
    assert_not_includes error.message, "secret"
    assert_equal 1, scribe_rows.count
    assert_equal 0, scribe_rows.where(status: :completed).count
  end

  private

  def assert_priced_scribe_row
    row = AiOrchestrator::AiInteraction.find_by!(model: "scribe_v2")
    assert row.completed?
    assert_equal "priced", row.pricing_status
    assert_equal 3_667, row.cost_microcents
    assert_equal 1, scribe_rows.count
    assert_equal 1, scribe_rows.where(status: :completed).count
    assert_equal 0, scribe_rows.where(status: :failed).count
  end

  def scribe_rows
    AiOrchestrator::AiInteraction.where(model: "scribe_v2")
  end

  class MeteringResponse
    attr_reader :audio_blob_key, :user
    attr_accessor :status, :transcription

    def initialize(audio_blob_key, user)
      @audio_blob_key = audio_blob_key
      @user = user
    end

    def route_step
      nil
    end

    def update!(attributes)
      attributes.each { |key, value| public_send("#{key}=", value) if respond_to?("#{key}=") }
    end
  end
end
