require "test_helper"
require "json"
require "open3"

# The cue helper is pure so it can be asserted without a browser. Node runs
# TypeScript directly from v23.6 (type stripping); measured on this machine,
# v25.9.0. Below that floor the test SKIPS WITH A MESSAGE — never silently,
# because a silently-skipped test is indistinguishable from a passing one.
class MotionCuesTest < ActiveSupport::TestCase
  MODULE_PATH = Rails.root.join("app/motion/src/lib/cues.ts")

  WORDS = [
    { "text" => "Mira",   "start" => 0.0, "end" => 0.3 },
    { "text" => "el",     "start" => 0.4, "end" => 0.5 },
    { "text" => "sujeto", "start" => 0.6, "end" => 1.0 },
    { "text" => "«Ele»",  "start" => 1.2, "end" => 1.6 },
    { "text" => "sujeto", "start" => 2.0, "end" => 2.4 }
  ].freeze

  def run_node(script)
    out, err, status = Open3.capture3("node", "--input-type=module", stdin_data: script)
    skip("node >= 23.6 required for TypeScript type stripping; got: #{err.lines.first}") unless status.success?
    JSON.parse(out)
  rescue Errno::ENOENT
    # Open3 raises when "node" is not on PATH at all (as opposed to being
    # present but too old, which surfaces as a non-zero exit above). Both
    # cases must SKIP WITH A MESSAGE — never silently, and never as an ERROR,
    # which would be indistinguishable from a real bug in CI output.
    skip("node >= 23.6 required for TypeScript type stripping; node was not found on PATH")
  end

  def cue(text, words: WORDS, from: 0)
    run_node(<<~JS)
      import {cueFor} from #{MODULE_PATH.to_s.to_json};
      const r = cueFor(#{text.to_json}, #{words.to_json}, #{from});
      console.log(JSON.stringify({cue: r}));
    JS
  end

  # Each Open3 call is a fresh node process, so cueStats() here reflects only
  # the single cueFor() call in that process — exactly what we need to see
  # whether a given call touched the asked/missed counters at all.
  def cue_and_stats(text, words: WORDS, from: 0)
    run_node(<<~JS)
      import {cueFor, cueStats} from #{MODULE_PATH.to_s.to_json};
      const r = cueFor(#{text.to_json}, #{words.to_json}, #{from});
      console.log(JSON.stringify({cue: r, stats: cueStats()}));
    JS
  end

  test "an exact match returns the word's start" do
    assert_in_delta 1.2, cue("«Ele»")["cue"], 0.001
  end

  test "case and punctuation are normalised away" do
    assert_in_delta 1.2, cue("ele")["cue"], 0.001,
      "the token as the scene draws it will not match the transcript byte for byte"
  end

  test "a repeated word resolves forward, not always to the first occurrence" do
    assert_in_delta 0.6, cue("sujeto")["cue"], 0.001
    assert_in_delta 2.0, cue("sujeto", from: 3)["cue"], 0.001,
      "searching from the previous cue is what keeps a repeated word in spoken order"
  end

  test "a token the narration never says is a miss, not a wrong time" do
    assert_nil cue("café")["cue"],
      "returning a plausible-looking time for a word never spoken is worse than " \
      "falling back to the beat's fixed duration"
  end

  test "no words at all is a miss, not a crash" do
    assert_nil cue("Ele", words: [])["cue"]
  end

  # New behaviour: a token that normalises to the empty string (punctuation
  # only, e.g. "?" or ".") is not a cue at all — cueFor returns null WITHOUT
  # touching asked or missed. A real token that is simply absent from `words`
  # still counts as a miss. Conflating the two would corrupt cueStats()' fallback
  # rate: every punctuation-only beat would silently count as a miss even though
  # it was never a word a voice could say.
  test "punctuation-only normalises to no cue at all, distinct from a real miss" do
    punctuation = cue_and_stats("¿?")
    assert_nil punctuation["cue"], "a punctuation-only token can never match a spoken word"
    assert_equal({ "asked" => 0, "missed" => 0 }, punctuation["stats"],
      "punctuation is not a word at all, so it must not move the fallback-rate counters")

    absent = cue_and_stats("café")
    assert_nil absent["cue"], "a real word missing from the transcript is still a miss"
    assert_equal({ "asked" => 1, "missed" => 1 }, absent["stats"],
      "a genuine miss must still count, or cueStats() understates the true fallback rate")
  end
end
