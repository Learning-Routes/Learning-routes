module LearningRoutesEngine
  class GapAnalysisJob < ApplicationJob
    queue_as :default
    retry_on StandardError, wait: :polynomially_longer, attempts: 3

    def perform(route_id, assessment_result_id: nil, user_feedback: nil)
      # `GapAnalyzer#initialize` reads `route.learning_profile&.user`
      # (gap_analyzer.rb:9), two associations deep. The per-environment picture is the
      # one spelled out in route_generation_job.rb: a WARN line in production and the
      # analysis still runs, nothing at all in development, and in test a raise that
      # `retry_on StandardError` swallowed — so no ReinforcementJob was enqueued and
      # gap_analysis_job_test.rb has been red.
      route = LearningRoute.includes(learning_profile: :user).find(route_id)

      # Idempotency: skip if gaps already analyzed for this assessment
      if assessment_result_id
        return if KnowledgeGap.where(learning_route: route, assessment_result_id: assessment_result_id).exists?
      end

      assessment_result = if assessment_result_id
                            Assessments::AssessmentResult.find(assessment_result_id)
      end

      analyzer = GapAnalyzer.new(
        route: route,
        assessment_result: assessment_result,
        user_feedback: user_feedback
      )

      gaps = analyzer.analyze!

      if gaps.any?
        Rails.logger.info("[GapAnalysisJob] Found #{gaps.size} gaps for route #{route_id}")
        ReinforcementJob.perform_later(route_id)
      else
        Rails.logger.info("[GapAnalysisJob] No gaps found for route #{route_id}")
      end
    end
  end
end
