module LearningRoutesEngine
  class StepQuizGenerationJob < ApplicationJob
    queue_as :default
    retry_on StandardError, wait: :polynomially_longer, attempts: 3

    QUESTION_COUNT = 4

    def perform(route_step_id)
      # Eager-load the route/profile/user chain: strict_loading_by_default is on, so
      # traversing these lazily is a violation (raises in dev/test, logs in production).
      step = RouteStep.includes(learning_route: { learning_profile: :user }).find(route_step_id)
      return unless step.requires_quiz?
      return if Assessments::Assessment.step_quizzes.for_step(step).exists?

      route = step.learning_route
      profile = route.learning_profile

      content = ContentEngine::AiContent.where(route_step: step).first
      content_summary = content&.body.to_s.truncate(2000)

      # Without these locale variables the prompt told the model, verbatim, to "Write
      # the ENTIRE lesson in English" — which is why a Spanish learner got a Spanish
      # lesson with an English quiz underneath it.
      locales = AiOrchestrator::LocaleResolver.for_route(route, user: profile.user)
      content_locale = locales[:locale]

      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :step_quiz,
        variables: {
          # Pass the locale explicitly: localized_title defaults to I18n.locale, which
          # in a job is the process default rather than this route's language.
          topic: step.localized_title(content_locale),
          description: step.localized_description(content_locale).to_s,
          content_summary: content_summary,
          user_level: profile.current_level,
          learning_style: Array(profile.learning_style).join(", "),
          bloom_level: step.bloom_level.to_s,
          route_topic: route.localized_topic(content_locale),
          question_count: QUESTION_COUNT.to_s,
          **locales
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

        ActiveRecord::Base.transaction do
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
        end
        Rails.logger.info("[StepQuizGenerationJob] Quiz generated for step #{route_step_id}: #{parsed['questions']&.size} questions")
      else
        Rails.logger.error("[StepQuizGenerationJob] AI failed for step #{route_step_id}: #{interaction.status}")
      end
    end
  end
end
