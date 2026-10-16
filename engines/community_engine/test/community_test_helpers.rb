# frozen_string_literal: true

# Builders shared by the community engine's integration tests.
module CommunityTestHelpers
  # Not `core.sign_in_path`: after a request under /community_engine the proxy
  # answers "/community_engine/sign_in" (see sign_in_as in test/test_helper.rb).
  def core_sign_in_path = Core::Engine.routes.url_helpers.sign_in_path

  def switch_to(user)
    delete Core::Engine.routes.url_helpers.sign_out_path
    sign_in_as(user)
  end

  def community_user(name)
    create_test_user(
      name: name,
      email: "#{name.parameterize}-#{SecureRandom.hex(4)}@example.test",
      email_verified_at: Time.current
    )
  end

  def route_for(user, topic: "Rust ownership", steps: 2)
    profile = LearningRoutesEngine::LearningProfile.find_by(user: user) ||
      LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
    route = LearningRoutesEngine::LearningRoute.create!(learning_profile: profile, topic: topic, status: :active)
    steps.times { |i| LearningRoutesEngine::RouteStep.create!(learning_route: route, title: "Step #{i + 1}", position: i) }
    route
  end

  # What SharedRoutesController#create does: the share plus its "shared" activity.
  def share_route(user, route = route_for(user), visibility: "public", description: nil)
    shared = CommunityEngine::RouteSharer.share!(route, user, visibility: visibility, description: description)
    CommunityEngine::Activity.create!(user: user, action: "shared", trackable: shared)
    shared
  end
end
