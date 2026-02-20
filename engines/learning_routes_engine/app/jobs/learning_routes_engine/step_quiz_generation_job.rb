module LearningRoutesEngine
  class StepQuizGenerationJob < ApplicationJob
    queue_as :default

    QUESTION_COUNT = 4

    def perform(route_step_id)
      step = RouteStep.find(route_step_id)
      return unless step.requires_quiz?
      return if Assessments::Assessment.step_quizzes.for_step(step).exists?

      route = step.learning_route
      profile = route.learning_profile

      content = ContentEngine::AiContent.where(route_step: step).first
      content_summary = content&.body.to_s.truncate(2000)

      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :step_quiz,
        variables: {
          topic: step.title,
          description: step.description.to_s,
          content_summary: content_summary,
          user_level: profile.current_level,
          learning_style: Array(profile.learning_style).join(", "),
          bloom_level: step.bloom_level.to_s,
          route_topic: route.topic,
          question_count: QUESTION_COUNT.to_s
        },
        user: profile.user,
        async: false
      )

      if interaction.completed?
        parser = AiOrchestrator::ResponseParser.new(
          interaction.response,
          expected_format: :json,
          task_type: "step_quiz"
        )
        parsed = parser.parse!

        assessment = Assessments::Assessment.create!(
          route_step: step,
          assessment_type: :step_quiz,
          passing_score: 80.0
        )

        Array(parsed["questions"]).first(5).each do |q|
          Assessments::Question.create!(
            assessment: assessment,
            body: q["question"],
            question_type: :multiple_choice,
            options: q["options"] || [],
            correct_answer: q["correct_answer"],
            explanation: q["explanation"],
            difficulty: q["difficulty"] || 1,
            bloom_level: q["bloom_level"] || step.bloom_level || 2
          )
        end

        step.update!(metadata: step.metadata.merge("step_quiz_id" => assessment.id, "step_quiz_generated" => true))
        Rails.logger.info("[StepQuizGenerationJob] Quiz generated for step #{route_step_id}: #{parsed['questions']&.size} questions")
      else
        Rails.logger.error("[StepQuizGenerationJob] AI failed for step #{route_step_id}: #{interaction.status}")
      end
    end
  end
end
