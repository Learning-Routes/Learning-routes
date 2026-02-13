module ContentEngine
  class AiContent < ApplicationRecord
    belongs_to :route_step, class_name: "LearningRoutesEngine::RouteStep"

    enum :content_type, { text: 0, code: 1, explanation: 2, exercise: 3 }, prefix: true

    validates :content_type, presence: true
    validates :body, presence: true

    scope :by_type, ->(type) { where(content_type: type) }
    scope :cached_content, -> { where(cached: true) }
    scope :by_model, ->(model) { where(ai_model: model) }

    def total_cost
      generation_cost || 0
    end
  end
end
