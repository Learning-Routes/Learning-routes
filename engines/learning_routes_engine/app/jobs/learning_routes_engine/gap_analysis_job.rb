module LearningRoutesEngine
  class GapAnalysisJob < ApplicationJob
    queue_as :default

    def perform(route_id, assessment_result_id: nil, user_feedback: nil)
      route = LearningRoute.find(route_id)

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
