require "test_helper"
require "rake"

# WP-37 §1.6. Read-only. It counts how production's reinforcement resolves its
# parent, and how many flags are not boolean true (so the single rule drops none
# of them silently).
class Wp37ReinforcementParentsTest < ActiveSupport::TestCase
  setup do
    Rails.application.load_tasks unless Rake::Task.task_defined?("wp37:reinforcement_parents")
    @task = Rake::Task["wp37:reinforcement_parents"]
    @task.reenable

    user = create_test_user(email_verified_at: Time.current)
    profile = LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Census", locale: "en", status: :active
    )
    preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
    make = lambda do |position, metadata = {}|
      @route.route_steps.create!(route_module: preview, position: position, title: "S#{position}",
                                 status: :available, content_type: :lesson, level: :nv1,
                                 bloom_level: 1, metadata: metadata)
    end
    @orphan = make.call(0, { "reinforcement" => true })
    first = make.call(1)
    make.call(2, { "reinforcement" => true, "triggering_step_id" => first.id })
    make.call(3, { "reinforcement" => true })
    make.call(4, { "reinforcement" => "true" })
  end

  test "counts stored, position, orphan and non-boolean flags, and changes nothing" do
    before = LearningRoutesEngine::RouteStep.where(learning_route_id: @route.id).pluck(:id, :metadata, :position)

    out, = capture_io { @task.invoke }

    assert_match(/3 reinforcement step\(s\) in 1 route\(s\): stored=1 position=1 orphan=1/, out)
    assert_match(/1 step\(s\) carry a reinforcement value that is not boolean true/, out)
    assert_match(/route=#{@route.id} stored=1 position=1 orphan=1/, out)
    assert_equal before,
                 LearningRoutesEngine::RouteStep.where(learning_route_id: @route.id).pluck(:id, :metadata, :position)
  end
end
