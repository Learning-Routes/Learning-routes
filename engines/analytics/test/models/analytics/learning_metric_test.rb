require "test_helper"

module Analytics
  class LearningMetricTest < ActiveSupport::TestCase
    test "requires metric_type" do
      metric = LearningMetric.new(metric_type: nil)
      assert_not metric.valid?
      assert_includes metric.errors[:metric_type], "can't be blank"
    end

    test "validates metric_type inclusion" do
      metric = LearningMetric.new(metric_type: "invalid_type")
      assert_not metric.valid?
      assert_includes metric.errors[:metric_type], "is not included in the list"
    end

    test "requires recorded_date" do
      metric = LearningMetric.new(recorded_date: nil)
      assert_not metric.valid?
      assert_includes metric.errors[:recorded_date], "can't be blank"
    end

    test "valid metric types" do
      expected = %w[completion_rate average_score study_time_minutes streak_days retention_rate knowledge_gap_count routes_completed]
      assert_equal expected, LearningMetric::METRIC_TYPES
    end
  end
end
