require "test_helper"
require "rake"

# The cleanup deletes production rows, so its guarantee is asserted, not assumed:
# it removes the junk and NEVER removes a step a student has opened.
class Wp29ReinforcementCleanupTest < ActiveSupport::TestCase
  def setup
    Rake::Task.clear
    Rails.application.load_tasks

    @user = create_test_user
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Portugués", locale: "es", status: :active
    )
    @preview = LearningRoutesEngine::RouteModule.find_by!(
      learning_route_id: @route.id, access_state: :preview
    )
    @real = step_at(0, title: "Lección real", reinforcement: false, status: :available)
  end

  def teardown
    Rake::Task.clear
  end

  test "the census counts without changing anything" do
    12.times { |i| 3.times { |j| step_at(1 + (i * 3) + j, reinforcement: true, status: :locked) } }
    before = LearningRoutesEngine::RouteStep.where(learning_route_id: @route.id).count

    capture_io { Rake::Task["wp29:census"].invoke }

    assert_equal before, LearningRoutesEngine::RouteStep.where(learning_route_id: @route.id).count
  end

  # The live route: twelve triplets, plus one the student actually opened.
  test "cleanup removes the untouched triplets and keeps the started one" do
    12.times { |i| 3.times { |j| step_at(1 + (i * 3) + j, reinforcement: true, status: :locked) } }
    started = step_at(100, reinforcement: true, status: :in_progress, title: "Refuerzo empezado")

    capture_io { Rake::Task["wp29:cleanup"].invoke }

    remaining = LearningRoutesEngine::RouteStep.where(learning_route_id: @route.id)
      .where("metadata->>'reinforcement' = 'true'")

    assert_equal [started.id], remaining.pluck(:id),
      "a step the student has opened is their work and is never deleted"
    assert LearningRoutesEngine::RouteStep.exists?(@real.id), "real lesson steps are untouched"
  end

  test "cleanup keeps a completed reinforcement step" do
    step_at(1, reinforcement: true, status: :locked)
    done = step_at(2, reinforcement: true, status: :completed)

    capture_io { Rake::Task["wp29:cleanup"].invoke }

    assert LearningRoutesEngine::RouteStep.exists?(done.id)
  end

  # total_steps is denormalised onto the route and every progress bar reads it.
  test "cleanup recounts total_steps so the progress bar is not left lying" do
    3.times { |j| step_at(1 + j, reinforcement: true, status: :locked) }
    @route.update!(total_steps: LearningRoutesEngine::RouteStep.where(learning_route_id: @route.id).count)

    capture_io { Rake::Task["wp29:cleanup"].invoke }

    assert_equal 1, @route.reload.total_steps
  end

  private

  def step_at(position, reinforcement:, status:, title: "Paso #{position}")
    @route.route_steps.create!(
      route_module: @preview, position: position, title: title, status: status,
      content_type: :lesson, level: :nv1, bloom_level: 1,
      metadata: reinforcement ? { "reinforcement" => true } : {}
    )
  end
end
