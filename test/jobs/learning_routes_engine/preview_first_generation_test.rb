require "test_helper"

module LearningRoutesEngine
  class PreviewFirstGenerationTest < ActiveJob::TestCase
    setup do
      user = create_test_user
      profile = LearningProfile.create!(user: user, current_level: "beginner")
      @route = LearningRoute.create!(learning_profile: profile, topic: "Preview first")
      @preview = RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
      @locked = @route.route_modules.create!(position: 2, title: "Paid module", access_state: :locked)
      @preview_steps = 2.times.map do |index|
        RouteStep.create!(learning_route: @route, route_module: @preview, position: index,
          title: "Preview #{index}", content_type: :lesson)
      end
      @locked_step = RouteStep.create!(learning_route: @route, route_module: @locked, position: 2,
        title: "Paid lesson", content_type: :lesson)
    end

    test "prefetch claims every preview step but never a locked paid step" do
      ids = ContentPrefetcher.pending_step_ids(@route)

      assert_equal @preview_steps.map(&:id), ids
      assert_equal @preview_steps.map(&:id).sort,
        ContentPrefetcher.claim(@preview_steps.map(&:id) + [@locked_step.id]).sort
      assert_not @locked_step.reload.content_generating?
    end

    test "direct stale generation jobs cannot create or enqueue paid content" do
      interactions = AiOrchestrator::AiInteraction.count
      assert_no_enqueued_jobs do
        ContentGenerationJob.perform_now(@locked_step.id)
        AssessmentGenerationJob.perform_now(@locked_step.id)
        StepQuizGenerationJob.perform_now(@locked_step.id)
        ContentPipelineJob.perform_now(@locked_step.id)
        ContentEngine::MediaPrefetchJob.perform_now(@locked_step.id)
        ContentEngine::AudioGenerationJob.perform_now(@locked_step.id)
        ContentEngine::SectionAudioGenerationJob.perform_now(@locked_step.id, 0, "Secret", "en")
      end

      assert_equal interactions, AiOrchestrator::AiInteraction.count
      assert_empty ContentEngine::AiContent.where(route_step: @locked_step)
      assert_empty Assessments::Assessment.where(route_step: @locked_step)
      assert_equal({}, @locked_step.reload.metadata)
    end
  end
end
