require "test_helper"

# STEP 33, then the owner's ruling of 13 October: every signed-in user sees the
# landing at `/`, as a visitor would. landing_for_everyone_test.rb pins "never a
# redirect" for every role; this file pins what a signed-in landing must also be:
# the visitor's nodes, and never a public cache entry.
class LandingSignedInTest < ActionDispatch::IntegrationTest
  setup do
    Core::User.where(role: :owner).update_all(role: Core::User.roles[:student])
  end

  test "the owner, signed in, sees the landing" do
    owner = signed_in(role: :owner, with_route: true)

    get root_path

    assert_landing_for(owner)
  end

  test "a teacher, signed in, sees the landing" do
    teacher = signed_in(role: :teacher, with_route: true)

    get root_path

    assert_landing_for(teacher)
  end

  test "a signed-in student with a route sees the landing at plain /" do
    student = signed_in(role: :student, with_route: true)

    get root_path

    assert_landing_for(student)
  end

  private

  def signed_in(role:, with_route:)
    user = create_test_user(email_verified_at: Time.current, role: role, locale: "es")
    profile = LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
    if with_route
      LearningRoutesEngine::LearningRoute.create!(learning_profile: profile, topic: "Portugués", locale: "es",
                                                  status: :active)
    end
    post core.sign_in_path, params: { email: user.email, password: "password123" }
    user
  end

  # The visitor landing: its own nodes, every satellite labelled, and never a
  # public cache entry. The page carries the signed-in navbar, so a shared cache
  # would hand this person's navbar to the next visitor.
  def assert_landing_for(_user)
    assert_response :success
    nodes = @controller.instance_variable_get(:@route_nodes)
    assert_equal 6, nodes.size
    assert nodes.flat_map { |node| Array(node[:sats]) }.all? { |sat| sat[:topic].present? }
    assert_no_match(/public/, response.headers["Cache-Control"].to_s)
  end
end
