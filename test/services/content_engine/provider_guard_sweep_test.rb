require "test_helper"

# THE CLASS: a provider is called outside SpendGuard.
#
# `AiClient#chat` calls `SpendGuard.call` at ai_client.rb:27 BEFORE any request
# and before any caller writes an AiInteraction row, so it is the only place a
# ceiling has to be checked to be checked everywhere. A call that reaches a
# provider by any other route spends money no ceiling saw and writes no ledger
# row — and the ledger is what WP-7 exists to make true.
#
# Shaped like WP-33's enrichment sweep, which is the shape that survives its own
# fix: this asserts ZERO offenders, and the companion test asserts the sweep is
# looking at what it thinks it is. "Exactly two offenders" would be an artifact
# of today's red that the very commit fixing it would have to invert.
class ProviderGuardSweepTest < ActiveSupport::TestCase
  GLOB = "{app,engines/*/app}/**/*.rb"

  # The one file allowed to name a provider: it is what runs the guard.
  ALLOWED = "engines/ai_orchestrator/app/services/ai_orchestrator/ai_client.rb"

  PATTERNS = {
    "RubyLLM.chat" => /RubyLLM\.chat\b/,
    "RubyLLM.paint" => /RubyLLM\.paint\b/,
    "api.elevenlabs.io" => %r{api\.elevenlabs\.io},
    "api.openai.com" => %r{api\.openai\.com}
  }.freeze

  def scanned_files
    Dir[Rails.root.join(GLOB)].reject { |f| f.end_with?(ALLOWED) }
  end

  # Full-line comments are stripped before matching. A comment that NAMES the
  # endpoint it stopped calling is not a provider call, and a file explaining why
  # it was routed through AiClient is exactly the file most likely to say the word
  # — this sweep flagged its own fix on the first run.
  #
  # Only full-line comments (first non-space character is `#`), never trailing
  # ones: `#` also appears inside string literals and regexes, and truncating at
  # the first one could hide a real call that sits after it on the same line.
  # A false positive is noise; a false negative is money.
  def code_of(path)
    File.readlines(path).reject { |line| line.lstrip.start_with?("#") }.join
  end

  test "no provider is called outside AiClient" do
    offenders = scanned_files.flat_map do |path|
      source = code_of(path)
      PATTERNS.filter_map do |name, re|
        "#{Pathname.new(path).relative_path_from(Rails.root)} — #{name}" if source.match?(re)
      end
    end

    assert_equal [], offenders.sort,
      "these reach a provider without SpendGuard.call, so they spend money no ceiling " \
      "saw and write no ledger row. Route them through AiOrchestrator::AiClient."
  end

  # Without this, a glob that silently stopped matching would report zero
  # offenders and read as success. An empty sweep is a broken sweep until proven
  # otherwise.
  # Stripping comments is the kind of leniency that can quietly turn a sweep into
  # a no-op, so both directions are pinned here rather than assumed.
  test "a commented mention is not an offender, but a real call still is" do
    commented = <<~RUBY
      # This used to post to api.elevenlabs.io directly.
      def transcribe = client.stt(file_path: path)
    RUBY
    real = <<~RUBY
      def transcribe
        Net::HTTP.post(URI("https://api.elevenlabs.io/v1/speech-to-text"), body)
      end
    RUBY

    Tempfile.create(["commented", ".rb"]) do |f|
      f.write(commented)
      f.flush
      assert_not code_of(f.path).match?(PATTERNS["api.elevenlabs.io"]),
        "a comment naming the endpoint was treated as a call"
    end

    Tempfile.create(["real", ".rb"]) do |f|
      f.write(real)
      f.flush
      assert code_of(f.path).match?(PATTERNS["api.elevenlabs.io"]),
        "stripping comments has made the sweep blind to an actual provider call"
    end
  end

  test "the sweep is looking at the files it thinks it is" do
    all = Dir[Rails.root.join(GLOB)]

    assert_operator all.size, :>=, 100,
      "the glob stopped matching the tree; the class test above would pass vacuously"
    assert all.any? { |f| f.end_with?(ALLOWED) },
      "ai_client.rb is outside the glob, so the sweep is not reaching provider code at all"
  end
end
