require "test_helper"

module AiOrchestrator
  # Drives CurriculumBrain's parse → validate → normalize pipeline directly,
  # bypassing the LLM call. We're auditing schema enforcement and shape
  # contract — not exercising the prompt itself (that requires real API calls).
  class CurriculumBrainTest < ActiveSupport::TestCase
    def setup
      @brain = CurriculumBrain.allocate
    end

    def valid_payload(overrides = {})
      base = {
        "title" => "Portuguese Foundations",
        "subtitle" => "Build a 200-word active vocabulary",
        "subject_area" => "Language · Portuguese",
        "subject_family" => "language",
        "translations" => { "en" => { "title" => "Portuguese" }, "es" => { "title" => "Portugués" } },
        "steps" => [
          step(0, prereqs: [], type: "lesson"),
          step(1, prereqs: [0], type: "lesson"),
          step(2, prereqs: [0, 1], type: "review"),
          step(3, prereqs: [0, 1, 2], type: "exercise"),
          step(4, prereqs: [0, 1, 2, 3], type: "assessment")
        ]
      }
      base.merge(overrides)
    end

    def step(idx, prereqs:, type: "lesson")
      {
        "label" => "Step #{idx}",
        "description" => "Description #{idx}",
        "level" => 1,
        "level_enum" => "nv1",
        "bloom_level" => 1,
        "content_type" => type,
        "delivery_format" => "mixed",
        "estimated_minutes" => 15,
        "prerequisites" => prereqs,
        "exercise_types" => ["flashcards"],
        "topics" => ["topic"],
        "translations" => { "en" => { "title" => "T" }, "es" => { "title" => "T" } }
      }
    end

    test "validate! accepts a well-formed payload" do
      assert_nothing_raised { @brain.send(:validate!, valid_payload) }
    end

    test "validate! rejects payload missing top-level keys" do
      err = assert_raises(CurriculumBrain::InvalidStructureError) do
        @brain.send(:validate!, { "title" => "x" })
      end
      assert_match(/missing top-level keys/, err.message)
    end

    test "validate! rejects an unknown subject_family" do
      err = assert_raises(CurriculumBrain::InvalidStructureError) do
        @brain.send(:validate!, valid_payload("subject_family" => "banana"))
      end
      assert_match(/invalid subject_family/, err.message)
    end

    test "validate! rejects a route that's too short" do
      err = assert_raises(CurriculumBrain::InvalidStructureError) do
        @brain.send(:validate!, valid_payload("steps" => [step(0, prereqs: [])]))
      end
      assert_match(/too few steps/, err.message)
    end

    test "validate! rejects bloom_level out of range" do
      payload = valid_payload
      payload["steps"][0]["bloom_level"] = 9
      err = assert_raises(CurriculumBrain::InvalidStructureError) do
        @brain.send(:validate!, payload)
      end
      assert_match(/bloom_level out of range/, err.message)
    end

    test "validate! rejects forward-referencing prerequisites" do
      payload = valid_payload
      payload["steps"][1]["prerequisites"] = [4] # references a later step
      err = assert_raises(CurriculumBrain::InvalidStructureError) do
        @brain.send(:validate!, payload)
      end
      assert_match(/bad prerequisite/, err.message)
    end

    test "validate! rejects when the first step is an assessment" do
      payload = valid_payload
      payload["steps"][0]["content_type"] = "assessment"
      err = assert_raises(CurriculumBrain::InvalidStructureError) do
        @brain.send(:validate!, payload)
      end
      assert_match(/first step is an assessment/, err.message)
    end

    test "normalize produces the shape WizardRouteGenerationJob consumes" do
      out = @brain.send(:normalize, valid_payload)
      assert_kind_of Hash, out
      assert_equal 5, out[:steps].size
      first = out[:steps].first
      assert first.key?(:label)
      assert first.key?(:description)
      assert first.key?(:level)
      assert first.key?(:level_enum)
      assert first.key?(:bloom_level)
      assert first.key?(:content_type)
      assert first.key?(:delivery_format)
      assert first.key?(:estimated_minutes)
      assert first.key?(:prerequisites)
      assert first.key?(:exercise_types)
      assert first.key?(:topics)
      assert first.key?(:translations)
    end

    test "parse_response strips code fences the LLM may add" do
      parsed = @brain.send(:parse_response, "```json\n{\"a\":1}\n```")
      assert_equal({ "a" => 1 }, parsed)
    end

    test "parse_response raises InvalidStructureError on garbage input" do
      err = assert_raises(CurriculumBrain::InvalidStructureError) do
        @brain.send(:parse_response, "not json at all")
      end
      assert_match(/not valid JSON/, err.message)
    end
  end
end
