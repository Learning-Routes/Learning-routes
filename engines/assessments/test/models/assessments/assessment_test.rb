require "test_helper"

module Assessments
  class AssessmentTest < ActiveSupport::TestCase
    test "assessment_type enum values" do
      assert_equal(
        { "diagnostic" => 0, "level_up" => 1, "final" => 2, "reinforcement" => 3 },
        Assessment.assessment_types
      )
    end

    test "passing_score validation" do
      assessment = Assessment.new(passing_score: 0)
      assert_not assessment.valid?
      assert_includes assessment.errors[:passing_score], "must be greater than 0"
    end
  end
end
