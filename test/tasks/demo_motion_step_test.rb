require "test_helper"
require "rake"

# STEP 38 §7. Production generation is down; the owner wants to see a motion
# scene. demo:motion_step appends one recognisable step with the `transform`
# example scene to the preview module of each of the user's routes, never on a
# route with paid modules the user has not bought; demo:motion_step:remove
# deletes them again.
class DemoMotionStepTest < ActiveSupport::TestCase
  setup do
    Rails.application.load_tasks unless Rake::Task.task_defined?("demo:motion_step")
    @add = Rake::Task["demo:motion_step"]
    @remove = Rake::Task["demo:motion_step:remove"]
    [@add, @remove].each(&:reenable)

    @user = create_test_user(email_verified_at: Time.current)
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = route("Portugués")
    @preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
    @route.route_steps.create!(route_module: @preview, position: 1, title: "Real", status: :available,
                               content_type: :lesson, level: :nv1, bloom_level: 1)
  end

  test "appends one demo step with the transform example to the preview module" do
    run_task(@add)

    step = demo_steps(@route).sole
    assert_equal "Demo: escena animada", step.title
    assert_equal @preview.id, step.route_module_id
    assert_equal 2, step.position
    assert step.content_ready?
    motion = step.metadata.fetch("parsed_sections").sole
    assert_equal "transform", motion["scene"]
    assert_equal ContentEngine::MotionScenes.example("transform"), motion["data"]
    assert_equal [], ContentEngine::MotionScenes.validate("transform", motion["data"])
    assert motion["narration"].present?
    assert ContentEngine::AiContent.exists?(route_step_id: step.id), "without text content the page starts generation"
  end

  test "is idempotent: a second run adds nothing" do
    run_task(@add)
    @add.reenable

    assert_no_difference -> { LearningRoutesEngine::RouteStep.count } do
      run_task(@add)
    end
    assert_equal 1, demo_steps(@route).count
  end

  test "never touches a route with a paid module the user has not bought" do
    locked = route("Bloqueada")
    LearningRoutesEngine::RouteModule.create!(learning_route: locked, position: 2, title: "Paid",
                                              access_state: :locked)

    out = run_task(@add)

    assert_empty demo_steps(locked)
    assert_equal 1, demo_steps(@route).count
    assert_match(/#{locked.id}.*paid/i, out)
  end

  test "a bought paid module does not block it" do
    bought = route("Comprada")
    LearningRoutesEngine::RouteModule.create!(learning_route: bought, position: 2, title: "Paid",
                                              access_state: :purchased)

    run_task(@add)

    assert_equal 1, demo_steps(bought).count
  end

  test "remove deletes the demo steps and their content, and nothing else" do
    run_task(@add)
    demo = demo_steps(@route).sole

    run_task(@remove)

    assert_empty demo_steps(@route)
    assert_not ContentEngine::AiContent.exists?(route_step_id: demo.id)
    assert_equal ["Real"], LearningRoutesEngine::RouteStep.where(learning_route_id: @route.id).pluck(:title)
  end

  test "an unknown or missing email aborts without writing" do
    assert_no_difference -> { LearningRoutesEngine::RouteStep.count } do
      assert_raises(SystemExit) { capture_io { with_email("nobody@example.com") { @add.invoke } } }
      @add.reenable
      assert_raises(SystemExit) { capture_io { with_email(nil) { @add.invoke } } }
    end
  end

  private

  def route(topic)
    LearningRoutesEngine::LearningRoute.create!(learning_profile: @profile, topic: topic, locale: "es",
                                                status: :active)
  end

  def demo_steps(route)
    LearningRoutesEngine::RouteStep.where(learning_route_id: route.id).where("metadata @> ?",
      { demo_motion_step: true }.to_json)
  end

  def run_task(task)
    out, = capture_io { with_email(@user.email) { task.invoke } }
    out
  end

  def with_email(email)
    original = ENV["EMAIL"]
    ENV["EMAIL"] = email
    yield
  ensure
    ENV["EMAIL"] = original
  end
end

# The point of the demo: the owner opens the step and the scene mounts.
class DemoMotionStepPageTest < ActionDispatch::IntegrationTest
  test "the demo step's page renders the transform scene" do
    Rails.application.load_tasks unless Rake::Task.task_defined?("demo:motion_step")
    user = create_test_user(email_verified_at: Time.current)
    profile = LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
    route = LearningRoutesEngine::LearningRoute.create!(learning_profile: profile, topic: "Demo", locale: "es",
                                                        status: :active)
    Rake::Task["demo:motion_step"].reenable
    ENV["EMAIL"] = user.email
    capture_io { Rake::Task["demo:motion_step"].invoke }
    step = LearningRoutesEngine::RouteStep.find_by!(learning_route_id: route.id, title: "Demo: escena animada")

    sign_in_as(user)
    get learning_routes_engine.route_step_path(route, step)

    assert_response :success
    assert_select ".lesson-motion[data-motion-scene-scene-value=transform]"
  ensure
    ENV.delete("EMAIL")
  end
end
