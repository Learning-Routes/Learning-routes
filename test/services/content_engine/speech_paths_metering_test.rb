require "test_helper"

class ContentEngine::SpeechPathsMeteringTest < ActiveSupport::TestCase
  setup do
    @user = create_test_user
    @mock_client = Object.new
    @mock_client.define_singleton_method(:chat) do |**|
      {
        content: "audio", billed_characters: 11,
        model_id: "eleven_multilingual_v2", latency_ms: 1
      }
    end
    stub_ai_client!
    @audio_paths = []
  end

  teardown do
    restore_ai_client!
    restore_route_step_find!
    @audio_paths.each { |path| FileUtils.rm_f(path) }
  end

  test "full lesson narration persists exactly one billable synthesis row" do
    generator = ContentEngine::AudioGenerator.allocate
    generator.instance_variable_set(:@user, @user)
    generator.instance_variable_set(:@step, Struct.new(:id).new("metered"))

    url = generator.send(:synthesize_audio, "hello", "voice")
    @audio_paths << Rails.root.join(url.delete_prefix("/"))

    assert_one_synthesis_row
  end

  test "section narration persists exactly one billable synthesis row" do
    profile = Struct.new(:user).new(@user)
    route = Struct.new(:learning_profile).new(profile)
    step = Struct.new(:learning_route).new(route)
    stub_route_step_find!(step)
    generator = ContentEngine::SectionAudioGenerator.new("metered", 0, "hello")

    url = generator.send(:synthesize_with_voice, "hello", "voice")
    @audio_paths << Rails.root.join(url.delete_prefix("/"))

    assert_one_synthesis_row
  end

  test "missing provider character usage remains explicitly unpriced" do
    result = { model_id: "eleven_multilingual_v2", billed_characters: nil }
    AiOrchestrator::SpeechCostRecorder.record_tts!(user: @user, result: result)

    row = AiOrchestrator::AiInteraction.find_by!(model: "eleven_multilingual_v2")
    assert_equal "unpriced", row.pricing_status
    assert_equal 0, row.cost_microcents
    assert_not_includes AiOrchestrator::AiInteraction.billable, row
  end

  private

  def assert_one_synthesis_row
    rows = AiOrchestrator::AiInteraction.where(model: "eleven_multilingual_v2")
    assert_equal 1, rows.count
    assert_equal 1_100, rows.first.cost_microcents
    assert_equal "priced", rows.first.pricing_status
  end

  def stub_ai_client!
    singleton = AiOrchestrator::AiClient.singleton_class
    singleton.alias_method :_original_new_for_speech_paths_test, :new
    client = @mock_client
    AiOrchestrator::AiClient.define_singleton_method(:new) { |**| client }
  end

  def restore_ai_client!
    singleton = AiOrchestrator::AiClient.singleton_class
    return unless singleton.method_defined?(:_original_new_for_speech_paths_test)

    singleton.alias_method :new, :_original_new_for_speech_paths_test
    singleton.remove_method :_original_new_for_speech_paths_test
  end

  def stub_route_step_find!(step)
    singleton = LearningRoutesEngine::RouteStep.singleton_class
    singleton.alias_method :_original_find_for_speech_paths_test, :find
    LearningRoutesEngine::RouteStep.define_singleton_method(:find) { |_id| step }
  end

  def restore_route_step_find!
    singleton = LearningRoutesEngine::RouteStep.singleton_class
    return unless singleton.method_defined?(:_original_find_for_speech_paths_test)

    singleton.alias_method :find, :_original_find_for_speech_paths_test
    singleton.remove_method :_original_find_for_speech_paths_test
  end
end
