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

  test "no provider is called outside AiClient" do
    offenders = scanned_files.flat_map do |path|
      source = File.read(path)
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
  test "the sweep is looking at the files it thinks it is" do
    all = Dir[Rails.root.join(GLOB)]

    assert_operator all.size, :>=, 100,
      "the glob stopped matching the tree; the class test above would pass vacuously"
    assert all.any? { |f| f.end_with?(ALLOWED) },
      "ai_client.rb is outside the glob, so the sweep is not reaching provider code at all"
  end
end
