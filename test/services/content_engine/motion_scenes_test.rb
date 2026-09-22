require "test_helper"

# The file set IS the vocabulary. There is no second list of scene names to
# drift from it — adding a scene is adding a schema and a .tsx, and the contract
# test in Task 11 fails if either is missing.
class MotionScenesTest < ActiveSupport::TestCase
  test "the scene vocabulary is discovered from the schema files" do
    assert_equal %w[agreement transform], ContentEngine::MotionScenes.names.sort
    assert ContentEngine::MotionScenes.known?("agreement")
    assert_not ContentEngine::MotionScenes.known?("nope")
  end

  test "every schema's own example validates against it" do
    ContentEngine::MotionScenes.names.each do |name|
      example = ContentEngine::MotionScenes.example(name)
      assert_equal [], ContentEngine::MotionScenes.validate(name, example),
        "#{name}.schema.json's examples[0] does not satisfy #{name}.schema.json — " \
        "and that example is the scene's FALLBACK, so the scene renders invalid data"
    end
  end

  test "a missing required key is reported, not swallowed" do
    data = ContentEngine::MotionScenes.example("agreement").except("verb")
    errors = ContentEngine::MotionScenes.validate("agreement", data)
    assert_not_empty errors
    assert errors.any? { |e| e.include?("verb") }, errors.inspect
  end

  test "an out-of-range index is rejected by the x-index-into pass" do
    data = ContentEngine::MotionScenes.example("agreement").merge("verb" => 99)
    errors = ContentEngine::MotionScenes.validate("agreement", data)
    assert errors.any? { |e| e.include?("verb") && e.include?("tokens") }, errors.inspect
  end

  test "an unexpected key is rejected" do
    data = ContentEngine::MotionScenes.example("agreement").merge("colour" => "red")
    errors = ContentEngine::MotionScenes.validate("agreement", data)
    assert_not_empty errors
    assert errors.any? { |e| e.include?("colour") }, errors.inspect
  end

  # The constraint that keeps this product usable outside Spanish and English.
  test "no schema constrains a string to a script or a language" do
    ContentEngine::MotionScenes.names.each do |name|
      raw = File.read(ContentEngine::MotionScenes.schema_path(name))
      assert_not_includes raw, '"pattern"',
        "#{name}.schema.json uses `pattern`, which is how a Latin-script assumption gets in"
    end
  end
end
