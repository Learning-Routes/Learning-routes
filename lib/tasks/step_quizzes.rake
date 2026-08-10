# frozen_string_literal: true

namespace :step_quizzes do
  desc "Report how many step quizzes would be regenerated for a route (read-only). " \
       "Usage: bin/rails step_quizzes:report[ROUTE_ID]"
  task :report, [:route_id] => :environment do |_t, args|
    route = find_route!(args[:route_id])
    stats = StepQuizReset.new(route).stats

    puts "route      : #{route.id}"
    puts "topic      : #{route.topic}  locale=#{route.locale} target_locale=#{route.target_locale.presence || '—'}"
    puts "steps      : #{stats[:steps]}"
    puts "quizzes    : #{stats[:assessments]}  (assessment_type: step_quiz)"
    puts "questions  : #{stats[:questions]}"
    puts "answers    : #{stats[:user_answers]}   <- destroyed with the questions"
    puts "results    : #{stats[:results]}        <- destroyed with the assessments"
    puts "steps flagged step_quiz_generated: #{stats[:flagged_steps]}"
    puts
    puts "Run bin/rails 'step_quizzes:reset[#{route.id}]' to delete these and let them regenerate."
  end

  desc "Delete a route's step quizzes so they regenerate in the student's language. " \
       "Usage: bin/rails step_quizzes:reset[ROUTE_ID]"
  task :reset, [:route_id] => :environment do |_t, args|
    route = find_route!(args[:route_id])
    reset = StepQuizReset.new(route)

    before = reset.stats
    puts "Deleting #{before[:assessments]} quiz/quizzes and #{before[:questions]} questions " \
         "for route #{route.id} (#{before[:steps]} steps)..."

    result = reset.run!

    puts "done. assessments=#{result[:assessments]} questions=#{result[:questions]} " \
         "steps_cleared=#{result[:steps_cleared]}"
    puts "Quizzes regenerate on next visit, via StepQuizGenerationJob."
  end

  def find_route!(route_id)
    abort "Usage: bin/rails 'step_quizzes:reset[ROUTE_ID]'" if route_id.blank?

    LearningRoutesEngine::LearningRoute.find_by(id: route_id) ||
      abort("No LearningRoute with id #{route_id}")
  end
end

# Deletes the step quizzes for one route and clears the metadata flags that would
# otherwise stop them being rebuilt.
#
# WHY THIS IS NEEDED: fixing StepQuizGenerationJob does not retranslate quizzes already
# in the database — they are stored English text. And both
# step_quiz_generation_job.rb:13 and steps_controller.rb:30 short-circuit on an existing
# record and on step.metadata["step_quiz_generated"], so a poisoned quiz is never
# rebuilt on its own.
#
# IDEMPOTENT: running it twice is a no-op — the second run finds nothing to delete and
# no flags to clear. Safe to re-run if it is interrupted.
class StepQuizReset
  METADATA_KEYS = %w[step_quiz_generated step_quiz_id].freeze

  def initialize(route)
    @route = route
  end

  def steps
    @steps ||= @route.route_steps.to_a
  end

  def assessments
    @assessments ||= Assessments::Assessment.step_quizzes.where(route_step_id: steps.map(&:id))
  end

  def stats
    assessment_ids = assessments.pluck(:id)
    question_ids = Assessments::Question.where(assessment_id: assessment_ids).pluck(:id)

    {
      steps: steps.size,
      assessments: assessment_ids.size,
      questions: question_ids.size,
      user_answers: Assessments::UserAnswer.where(question_id: question_ids).count,
      results: Assessments::AssessmentResult.where(assessment_id: assessment_ids).count,
      flagged_steps: steps.count { |s| s.metadata&.dig("step_quiz_generated") }
    }
  end

  def run!
    counts = stats
    steps_cleared = 0

    ActiveRecord::Base.transaction do
      # destroy_all, not delete_all: questions, user answers and results hang off these
      # and must go with them rather than being orphaned.
      #
      # strict_loading(false) because the cascade legitimately traverses
      # question -> user_answers to destroy them. strict_loading_by_default is on, so
      # without this the task raises in dev/test (and logs a violation per row in
      # production). A cascading destroy is exactly the case the guard is not aimed at.
      assessments.strict_loading(false).destroy_all

      steps.each do |step|
        metadata = step.metadata || {}
        next unless METADATA_KEYS.any? { |k| metadata.key?(k) }

        step.update!(metadata: metadata.except(*METADATA_KEYS))
        steps_cleared += 1
      end
    end

    { assessments: counts[:assessments], questions: counts[:questions], steps_cleared: steps_cleared }
  end
end
