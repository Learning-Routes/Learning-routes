require "test_helper"

# validate's "never raises" guarantee is structural (is_a? checks throughout
# the walker), not a rescue around it — a bare rescue would also swallow bugs
# in the walker itself and still look like a successful rejection. These
# cases are the ones a real model response could actually produce (JSON.parse
# only ever yields Hash/Array/String/Numeric/true/false/nil), each one wrong
# in a different way and at a different depth.
class MotionScenesMalformedInputTest < ActiveSupport::TestCase
  test "data that is not a Hash at all does not raise" do
    ["not a hash", [1, 2, 3], nil, 42].each do |data|
      errors = ContentEngine::MotionScenes.validate("agreement", data)
      assert_not_empty errors, "#{data.inspect} should be rejected, not accepted"
    end
  end

  test "a Hash whose tokens is a String instead of an array does not raise" do
    data = ContentEngine::MotionScenes.example("agreement").merge("tokens" => "hello")
    errors = ContentEngine::MotionScenes.validate("agreement", data)
    assert_not_empty errors
    assert errors.any? { |e| e.include?("tokens") }, errors.inspect
  end

  test "a Hash whose subject is a String instead of an integer does not raise" do
    data = ContentEngine::MotionScenes.example("agreement").merge("subject" => "zero")
    errors = ContentEngine::MotionScenes.validate("agreement", data)
    assert_not_empty errors
    assert errors.any? { |e| e.include?("subject") }, errors.inspect
  end

  test "a deeply nested unexpected shape does not raise" do
    data = { "steps" => [{ "tokens" => { "a" => 1 }, "hi" => "x" }] }
    errors = ContentEngine::MotionScenes.validate("transform", data)
    assert_not_empty errors
  end
end
