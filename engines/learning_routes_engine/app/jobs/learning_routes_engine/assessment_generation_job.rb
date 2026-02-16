module LearningRoutesEngine
  class AssessmentGenerationJob < ApplicationJob
    queue_as :default

    ASSESSMENT_TYPE_MAP = {
      "quiz" => :diagnostic,
      "exam" => :level_up,
      "final" => :final,
      "level_up_exam" => :level_up,
      "reinforcement" => :reinforcement
    }.freeze

    def perform(route_step_id)
      step = RouteStep.find(route_step_id)
      route = step.learning_route
      profile = route.learning_profile

      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :exam_questions,
        variables: {
          topic: step.title,
          description: step.description.to_s,
          level: profile.current_level,
          bloom_level: step.bloom_level.to_s,
          route_topic: route.topic,
          assessment_type: step.metadata["assessment_type"] || "quiz"
        },
        user: profile.user,
        async: false
      )

      if interaction.completed?
        parser = AiOrchestrator::ResponseParser.new(
          interaction.response,
          expected_format: :json,
          task_type: "exam_questions"
        )
        parsed = parser.parse!

        assessment_type = ASSESSMENT_TYPE_MAP[step.metadata["assessment_type"]] || :diagnostic

        assessment = Assessments::Assessment.create!(
          route_step: step,
          assessment_type: assessment_type,
          passing_score: 70.0,
        )

        Array(parsed["questions"]).each do |q|
          Assessments::Question.create!(
            assessment: assessment,
            body: q["question"],
            question_type: map_question_type(q["type"]),
            options: q["options"] || [],
            correct_answer: q["correct_answer"],
            explanation: q["explanation"],
            difficulty: q["difficulty"] || 1,
            bloom_level: q["bloom_level"] || step.bloom_level || 1
          )
        end

        step.update!(metadata: step.metadata.merge(assessment_id: assessment.id, assessment_generated: true))
        Rails.logger.info("[AssessmentGenerationJob] Assessment generated for step #{route_step_id}: #{parsed['questions']&.size} questions")
      else
        Rails.logger.error("[AssessmentGenerationJob] AI failed for step #{route_step_id}: #{interaction.status}")
      end
    end

    private

    def map_question_type(type_str)
      case type_str.to_s.downcase
      when "multiple_choice", "mcq" then :multiple_choice
      when "short_answer", "text" then :short_answer
      when "code", "coding" then :code
      when "practical", "project" then :practical
      else :multiple_choice
      end
    end
  end
end
