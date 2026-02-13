module Assessments
  class Question < ApplicationRecord
    belongs_to :assessment

    has_many :user_answers, dependent: :destroy

    enum :question_type, { multiple_choice: 0, short_answer: 1, code: 2, practical: 3 }

    validates :body, presence: true
    validates :question_type, presence: true
    validates :difficulty, numericality: { in: 1..5 }
    validates :bloom_level, numericality: { in: 1..6 }

    scope :by_type, ->(type) { where(question_type: type) }
    scope :by_difficulty, ->(level) { where(difficulty: level) }
    scope :by_bloom_level, ->(level) { where(bloom_level: level) }

    # Bloom's Taxonomy levels:
    # 1: Remember, 2: Understand, 3: Apply, 4: Analyze, 5: Evaluate, 6: Create
    BLOOM_LEVELS = {
      1 => "Remember",
      2 => "Understand",
      3 => "Apply",
      4 => "Analyze",
      5 => "Evaluate",
      6 => "Create"
    }.freeze

    def bloom_label
      BLOOM_LEVELS[bloom_level]
    end
  end
end
