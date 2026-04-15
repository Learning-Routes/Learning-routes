# frozen_string_literal: true

module LearningRoutesEngine
  class TutorMessage < ApplicationRecord
    VALID_ROLES = %w[user assistant tool].freeze

    belongs_to :user, class_name: "Core::User"
    belongs_to :step, class_name: "LearningRoutesEngine::RouteStep", foreign_key: :step_id

    validates :role, inclusion: { in: VALID_ROLES }
    validates :content, presence: true

    scope :recent, -> { order(created_at: :asc).last(10) }
    scope :for_step, ->(step_id) { where(step_id: step_id) }
  end
end
