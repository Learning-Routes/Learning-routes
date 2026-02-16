module AiOrchestrator
  class AiModelConfig < ApplicationRecord
    validates :model_name, presence: true
    validates :task_type, presence: true
    validates :priority, numericality: { greater_than_or_equal_to: 0 }

    scope :enabled, -> { where(enabled: true) }
    scope :for_task, ->(task) { where(task_type: task).order(:priority) }

    TASK_TYPES = %w[
      assessment_questions
      route_generation
      lesson_content
      code_generation
      exam_questions
      quick_grading
      voice_narration
      image_generation
      quick_images
      gap_analysis
      reinforcement_generation
      explain_differently
      give_example
      simplify_content
      exercise_hint
    ].freeze

    validates :task_type, inclusion: { in: TASK_TYPES }

    def self.primary_model_for(task_type)
      enabled.for_task(task_type).first
    end

    def self.fallback_model_for(task_type)
      config = primary_model_for(task_type)
      return nil unless config&.fallback_model
      enabled.find_by(model_name: config.fallback_model, task_type: task_type)
    end
  end
end
