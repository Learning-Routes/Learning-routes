require "test_helper"
require "json"
require "open3"

# WP-36 §16: the picture follows the voice. `driftSeek` is the ONE decision —
# should the player be yanked to match the audio, and to where — factored out
# of motion_scene_controller.js into a pure function so it is node-testable the
# same way app/motion/src/lib/cues.ts is (see motion_cues_test.rb), rather than
# only assertable through a browser's `timeupdate` events.
#
# Node runs TypeScript directly from v23.6 (type stripping); measured on this
# machine, v25.9.0. Below that floor the test SKIPS WITH A MESSAGE — never
# silently, because a silently-skipped test is indistinguishable from a
# passing one.
class MotionSyncTest < ActiveSupport::TestCase
  MODULE_PATH = Rails.root.join("app/motion/src/lib/sync.ts")

  def run_node(script)
    out, err, status = Open3.capture3("node", "--input-type=module", stdin_data: script)
    skip("node >= 23.6 required for TypeScript type stripping; got: #{err.lines.first}") unless status.success?
    JSON.parse(out)
  rescue Errno::ENOENT
    skip("node >= 23.6 required for TypeScript type stripping; node was not found on PATH")
  end

  def drift_seek(player_time, audio_time, threshold: nil)
    threshold_arg = threshold.nil? ? "undefined" : threshold.to_json
    run_node(<<~JS)
      import {driftSeek} from #{MODULE_PATH.to_s.to_json};
      const r = driftSeek(#{player_time.to_json}, #{audio_time.to_json}, #{threshold_arg});
      console.log(JSON.stringify({seek: r}));
    JS
  end

  test "no correction when the picture and the voice agree" do
    assert_nil drift_seek(10.0, 10.0)["seek"]
  end

  test "no correction just under the threshold" do
    assert_nil drift_seek(10.0, 10.119)["seek"]
  end

  test "seeks to the audio's time once drift exceeds the threshold" do
    result = drift_seek(10.0, 10.2)["seek"]
    assert_in_delta 10.2, result, 0.0001,
      "the audio is ground truth: a correction always targets audio.currentTime, never a delta applied to the player"
  end

  test "a negative drift (the picture is ahead) also corrects" do
    result = drift_seek(10.2, 10.0)["seek"]
    assert_in_delta 10.0, result, 0.0001,
      "drift is measured as a magnitude — the picture running ahead of the voice is just as wrong as running behind"
  end

  test "the threshold is configurable, not hardcoded at the default" do
    assert_nil drift_seek(10.0, 10.4, threshold: 0.5)["seek"],
      "a caller-supplied threshold must be honoured, not the default 120ms"
    result = drift_seek(10.0, 10.4, threshold: 0.1)["seek"]
    assert_in_delta 10.4, result, 0.0001
  end

  test "non-finite input never seeks" do
    result = run_node(<<~JS)
      import {driftSeek} from #{MODULE_PATH.to_s.to_json};
      const r = driftSeek(NaN, 10.0);
      console.log(JSON.stringify({seek: r}));
    JS
    assert_nil result["seek"], "a NaN player time must not produce a seek target"
  end
end
