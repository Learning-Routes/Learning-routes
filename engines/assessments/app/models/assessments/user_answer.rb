module Assessments
  class UserAnswer < ApplicationRecord
    belongs_to :user, class_name: "Core::User"
    belongs_to :question

    validates :answer, presence: true, length: { maximum: 10_000 }

    scope :correct_answers, -> { where(correct: true) }
    scope :incorrect_answers, -> { where(correct: false) }
    scope :for_user, ->(user) { where(user: user) }
  end
end
