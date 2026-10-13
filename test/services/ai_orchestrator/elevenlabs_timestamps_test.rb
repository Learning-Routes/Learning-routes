require "test_helper"

# ElevenLabs' /with-timestamps returns JSON — audio_base64 plus a CHARACTER
# alignment — where the plain endpoint returns audio/mpeg bytes. Words are
# derived here, once, so nothing downstream re-implements the run-of-non-space
# rule differently.
#
# NOTE on ALIGNMENT: the brief's literal used `%w[H o l a   q u é]`, which
# Ruby collapses to 7 elements (`%w[]` never yields a literal space token —
# `ruby -e 'p %w[H o l a   q u é]'` prints `["H", "o", "l", "a", "q", "u",
# "é"]`), while the start/end time arrays it paired that with have 8 entries
# and the assertions require a real space character at index 4 to split
# "Hola" from "qué". Written explicitly below as a plain array literal with a
# genuine `" "` element so the test exercises the split it claims to, rather
# than passing or failing for the wrong reason.
class ElevenlabsTimestampsTest < ActiveSupport::TestCase
  ALIGNMENT = {
    "characters"                    => ["H", "o", "l", "a", " ", "q", "u", "é"],
    "character_start_times_seconds" => [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
    "character_end_times_seconds"   => [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.9]
  }.freeze

  DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"
  TIMESTAMPS_URL = "https://api.elevenlabs.io/v1/text-to-speech/#{DEFAULT_VOICE_ID}/with-timestamps"

  # ── the pure function ─────────────────────────────────────────────────────

  test "a word is a run of non-space characters, timed first-start to last-end" do
    words = AiOrchestrator::AiClient.words_from_alignment(ALIGNMENT)

    assert_equal %w[Hola qué], words.map { |w| w["text"] }
    assert_in_delta 0.0, words[0]["start"], 0.001
    assert_in_delta 0.4, words[0]["end"], 0.001
    assert_in_delta 0.5, words[1]["start"], 0.001
    assert_in_delta 0.9, words[1]["end"], 0.001
  end

  test "alignment with no characters yields no words rather than raising" do
    assert_equal [], AiOrchestrator::AiClient.words_from_alignment({})
  end

  test "a non-Latin script is not special-cased" do
    a = { "characters" => %w[日 本 語], "character_start_times_seconds" => [0.0, 0.1, 0.2],
          "character_end_times_seconds" => [0.1, 0.2, 0.3] }
    assert_equal ["日本語"], AiOrchestrator::AiClient.words_from_alignment(a).map { |w| w["text"] }
  end

  # ── the endpoint shape: params[:timestamps] == true swaps to /with-timestamps ──

  def alignment_payload
    { "audio_base64" => Base64.strict_encode64("fake-audio-bytes"), "alignment" => ALIGNMENT }
  end

  test "timestamps: true hits /with-timestamps, decodes audio, and derives words" do
    request = stub_request(:post, TIMESTAMPS_URL)
      .to_return(
        status: 200,
        body: alignment_payload.to_json,
        headers: { "Content-Type" => "application/json", "character-cost" => "9" }
      )

    result = AiOrchestrator::AiClient.new(model: "elevenlabs", task_type: :voice_narration)
      .chat(prompt: "Hola qué", params: { timestamps: true })

    assert_requested request
    assert_equal "fake-audio-bytes", result[:content]
    assert_equal ALIGNMENT, result[:alignment]
    assert_equal %w[Hola qué], result[:words].map { |w| w["text"] }
    assert_equal 9, result[:billed_characters], "the character-cost header is present, so it must be used verbatim"
  end

  # The ledger must never show $0.00 for a paid call. This is the branch
  # `openai_chat` already gets wrong (recorded roadmap debt) — this must not
  # become the second instance of it.
  test "a missing character-cost header falls back to text.length and logs a warning" do
    stub_request(:post, TIMESTAMPS_URL)
      .to_return(status: 200, body: alignment_payload.to_json, headers: { "Content-Type" => "application/json" })

    log = StringIO.new
    original_logger = Rails.logger
    Rails.logger = Logger.new(log)

    result = nil
    begin
      result = AiOrchestrator::AiClient.new(model: "elevenlabs", task_type: :voice_narration)
        .chat(prompt: "Hola qué", params: { timestamps: true })
    ensure
      Rails.logger = original_logger
    end

    assert_equal "Hola qué".length, result[:billed_characters],
      "no character-cost header was returned, so billing must fall back to text.length rather than go unbilled"
    assert_match(/with-timestamps returned no character-cost header/, log.string)
  end

  # ── proving the guard still runs before this endpoint too ────────────────
  #
  # Not a substitute for the manual "comment out SpendGuard.call and watch
  # spend_guard_test go red" check the brief asks for — that check lives in
  # the task report, done by hand against the real source line. This test
  # just pins, going forward, that a refused ceiling never reaches the new
  # endpoint either.
  test "a refused ceiling stops the timestamps call before any HTTP" do
    request = stub_request(:post, TIMESTAMPS_URL)
    original_alerts = Rails.application.config.ai_cost_alerts
    Rails.application.config.ai_cost_alerts = original_alerts.merge(daily_limit: 0)

    begin
      assert_raises(AiOrchestrator::SpendGuard::LimitExceeded) do
        AiOrchestrator::AiClient.new(model: "elevenlabs", task_type: :voice_narration)
          .chat(prompt: "Hola qué", params: { timestamps: true })
      end
    ensure
      Rails.application.config.ai_cost_alerts = original_alerts
    end

    assert_not_requested request
  end
end
