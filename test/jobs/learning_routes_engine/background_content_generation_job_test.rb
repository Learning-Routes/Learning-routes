require "test_helper"

# STEP 37 §5: one pass claims at most MAX_IN_FLIGHT_PER_ROUTE pipelines, then
# re-schedules itself. A second pass while those are in flight enqueues no pipeline,
# so a step is never generated (and billed) twice.
class LearningRoutesEngine::BackgroundContentGenerationJobTest < ActiveJob::TestCase
  JOB = LearningRoutesEngine::BackgroundContentGenerationJob
  PIPELINE = LearningRoutesEngine::ContentPipelineJob

  setup do
    profile = LearningRoutesEngine::LearningProfile.create!(user: create_test_user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(learning_profile: profile, topic: "T", locale: "en", status: :active)
    @steps = 5.times.map do |i|
      @route.route_steps.create!(title: "Step #{i}", position: i, status: i.zero? ? :available : :locked,
                                 content_type: "lesson", delivery_format: "text", level: 1, bloom_level: 1)
    end
    @steps.first.update!(metadata: { "content_ready" => true })
  end

  test "enqueues the first pending pipelines plus its own re-check, and a second run adds no pipeline" do
    JOB.perform_now(@route.id)

    pipelines = enqueued_jobs.select { |j| j["job_class"] == PIPELINE.name }
    assert_equal @steps[1, 2].map(&:id), pipelines.map { |j| j["arguments"].first }
    assert_equal true, pipelines.first["arguments"].second["pregenerate_audio"]
    assert_enqueued_with job: JOB, args: [@route.id, {}, 1]

    clear_enqueued_jobs
    JOB.perform_now(@route.id, {}, 1)

    assert_no_enqueued_jobs only: PIPELINE
    assert_enqueued_with job: JOB, args: [@route.id, {}, 2]
  end

  test "stops when every step is ready" do
    @steps.each { |s| s.update!(metadata: { "content_ready" => true }) }

    JOB.perform_now(@route.id)

    assert_no_enqueued_jobs
  end
end
