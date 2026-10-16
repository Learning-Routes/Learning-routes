require "test_helper"

# STEP 37 §1. content_delivery_seed replaces the first route's steps with
# sample content. It must only ever do that to the demo account's route in a
# local environment; on anyone else's route it is data loss.
class ContentDeliverySeedTest < ActiveSupport::TestCase
  SEED = Rails.root.join("db/seeds/content_delivery_seed.rb")

  test "in production it leaves a real user's route untouched" do
    route = route_for(create_test_user)

    out = with_env("production") { run_seed }

    assert_equal ["Real"], step_titles(route)
    assert_match "skipped: production data", out
  end

  test "locally it leaves a route that is not the demo account's untouched" do
    route = route_for(create_test_user)

    out = run_seed

    assert_equal ["Real"], step_titles(route)
    assert_match "skipped: production data", out
  end

  test "locally it replaces the demo account's route steps with the sample content" do
    route = route_for(create_test_user(email: "student@learning-routes.com"))

    run_seed

    assert_equal 8, step_titles(route).size
    assert_not_includes step_titles(route), "Real"
  end

  private

  def route_for(user)
    profile = LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
    route = LearningRoutesEngine::LearningRoute.create!(learning_profile: profile, topic: "Mine", locale: "en")
    route.route_steps.create!(position: 0, title: "Real", status: :available, content_type: :lesson,
                              level: :nv1, bloom_level: 1)
    route
  end

  def step_titles(route)
    LearningRoutesEngine::RouteStep.where(learning_route_id: route.id).order(:position).pluck(:title)
  end

  def run_seed
    capture_io { load SEED }.first
  end

  # Rails.env is swapped by hand: Minitest 6 ships no `stub`.
  def with_env(name)
    original = Rails.env
    Rails.env = name
    yield
  ensure
    Rails.env = original
  end
end
