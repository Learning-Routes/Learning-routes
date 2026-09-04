# frozen_string_literal: true

# The claim for a PAID side effect.
#
# `ResultsController#submit` enqueues GapAnalysisJob, which runs GapAnalyzer and
# chains ReinforcementJob -> ReinforcementGenerator: two Orchestrate calls. It ran
# as step 4 of 6 side effects that all execute AFTER the score has committed and
# outside any transaction, so a failure in later bookkeeping had already spent the
# money — and the student, shown nothing, started again.
#
# Ordering alone is not enough. The score commit is the idempotency claim for the
# REQUEST, but a request whose bookkeeping fails must be able to complete the
# spend later without buying it twice. This column is that claim: set by a
# conditional UPDATE, so exactly one caller can ever win it.
class AddGapAnalysisEnqueuedAtToAssessmentResults < ActiveRecord::Migration[8.1]
  def change
    add_column :assessments_assessment_results, :gap_analysis_enqueued_at, :datetime
  end
end
