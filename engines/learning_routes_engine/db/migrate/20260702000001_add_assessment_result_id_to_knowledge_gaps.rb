# frozen_string_literal: true

# Adds a queryable link from a knowledge gap back to the assessment result
# that produced it. GapAnalysisJob relied on this for idempotency but queried
# a non-existent `metadata` column, so gap analysis crashed on every real
# assessment. A dedicated indexed column (no cross-engine FK, matching how
# user_id is referenced) lets us both dedupe and trace provenance.
class AddAssessmentResultIdToKnowledgeGaps < ActiveRecord::Migration[8.1]
  def change
    add_column :learning_routes_engine_knowledge_gaps, :assessment_result_id, :uuid

    add_index :learning_routes_engine_knowledge_gaps,
              [:learning_route_id, :assessment_result_id],
              name: "idx_knowledge_gaps_on_route_and_result"
  end
end
