require "test_helper"

# WP-20 §C: preview modules generate narration on demand; purchased modules
# pre-generate. Both gates stay shut in WP-36 — MediaPrefetchJob:24 and
# ContentPipelineJob:24 both `return unless preview_access?`, so a purchased step
# generates nothing at all until Task 8 of the roadmap. The purchased branch here
# is therefore DORMANT BY DESIGN and this is its test: it is the thing that makes
# a dormant branch honest rather than dead code nobody can evaluate.
class NarrationPrefetchTypesTest < ActiveSupport::TestCase
  test "a preview module pre-generates concept and summary, never motion" do
    types = ContentEngine::MediaPrefetchJob.narration_prefetch_types(:preview)

    assert_equal %w[concept summary], types.sort
    assert_not_includes types, "motion",
      "a preview module must not pre-generate narration for a scene the student may never open"
  end

  test "a purchased module pre-generates motion too" do
    assert_includes ContentEngine::MediaPrefetchJob.narration_prefetch_types(:purchased), "motion"
  end

  test "an unknown access state pre-generates nothing" do
    assert_equal [], ContentEngine::MediaPrefetchJob.narration_prefetch_types(:locked)
  end
end
