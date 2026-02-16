module ContentEngine
  class UserNote < ApplicationRecord
    belongs_to :user, class_name: "Core::User"
    belongs_to :route_step, class_name: "LearningRoutesEngine::RouteStep"

    validates :body, presence: true, length: { maximum: 10_000 }

    scope :for_user, ->(user) { where(user: user) }
    scope :for_step, ->(step) { where(route_step: step) }
    scope :ordered, -> { order(:created_at) }
  end
end
