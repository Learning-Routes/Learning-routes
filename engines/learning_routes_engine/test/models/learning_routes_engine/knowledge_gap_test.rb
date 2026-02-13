require "test_helper"

module LearningRoutesEngine
  class KnowledgeGapTest < ActiveSupport::TestCase
    test "requires topic" do
      gap = KnowledgeGap.new(topic: nil)
      assert_not gap.valid?
      assert_includes gap.errors[:topic], "can't be blank"
    end

    test "severity enum values" do
      assert_equal({ "low" => 0, "medium" => 1, "high" => 2 }, KnowledgeGap.severities)
    end

    test "default resolved is false" do
      gap = KnowledgeGap.new
      assert_equal false, gap.resolved
    end
  end
end
