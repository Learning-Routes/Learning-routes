module CommunityEngine
  class Rating < ApplicationRecord
    belongs_to :user, class_name: "Core::User"
    belongs_to :shared_route, class_name: "CommunityEngine::SharedRoute"

    validates :score, presence: true, inclusion: { in: 1..5 }
    validates :user_id, uniqueness: { scope: :shared_route_id, message: "has already rated this route" }

    after_create :increment_counters
    after_destroy :decrement_counters
    after_update :update_counters, if: :saved_change_to_score?

    private

    def increment_counters
      # .to_i guarantees integer — safe for interpolation
      shared_route.class.where(id: shared_route_id).update_all(
        Arel.sql("ratings_count = ratings_count + 1, ratings_sum = ratings_sum + #{score.to_i}")
      )
    end

    def decrement_counters
      shared_route.class.where(id: shared_route_id).update_all(
        Arel.sql("ratings_count = GREATEST(ratings_count - 1, 0), ratings_sum = GREATEST(ratings_sum - #{score.to_i}, 0)")
      )
    end

    def update_counters
      diff = (score - score_before_last_save).to_i
      shared_route.class.where(id: shared_route_id).update_all(
        Arel.sql("ratings_sum = GREATEST(ratings_sum + #{diff}, 0)")
      )
    end
  end
end
