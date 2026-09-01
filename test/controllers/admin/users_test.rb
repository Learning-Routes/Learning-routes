require "test_helper"

class AdminUsersTest < ActionDispatch::IntegrationTest
  setup do
    Core::User.where(role: :owner).update_all(role: Core::User.roles[:student])
    @owner = create_test_user(role: :owner, email_verified_at: Time.current)
    @student = create_test_user(name: "Needle Student", email: "needle-ui@example.test")
    @student.sessions.create!(last_active_at: 1.hour.ago)
    profile = LearningRoutesEngine::LearningProfile.create!(user: @student)
    @route = profile.learning_routes.create!(topic: "Private Algebra", status: :paused, generation_status: "completed")
    @route.route_steps.create!(title: "Finished", position: 0, status: :completed)
    @route.route_steps.create!(title: "Waiting", position: 1, status: :locked)
    AiOrchestrator::AiInteraction.create!(user: @student, model: "gpt-5.2", prompt: "PRIVATE PROMPT",
      response: "PRIVATE RESPONSE", status: :completed, pricing_status: "priced", cost_microcents: 50_000,
      metadata: { route_id: @route.id })
    AiOrchestrator::AiInteraction.create!(user: @student, model: "tavily", prompt: "PRIVATE UNPRICED PROMPT",
      status: :completed, pricing_status: "unpriced", metadata: { route_id: @route.id })
    sign_in_as(@owner)
  end

  test "searches filters and links to the selected user" do
    get admin_users_path, params: { search: "needle", activity: "active", route_state: "paused" }

    assert_response :success
    assert_select "input[name='search'][value='needle']"
    assert_select "a[href='#{admin_user_path(@student)}']", text: "Needle Student"
    assert_select "[data-user-id='#{@student.id}']", count: 1
    assert_select "[data-user-id='#{@student.id}'] [data-cost-status]", text: /Pricing incomplete/
    assert_no_match(/PRIVATE PROMPT|PRIVATE RESPONSE/, response.body)
  end

  test "paginates without loading an unbounded user list" do
    26.times { |i| create_test_user(name: "Page User #{i}") }

    get admin_users_path, params: { page: 1 }

    assert_select "tbody tr", count: 25
    assert_select "a[href*='page=2']"
  end

  test "drill-down shows account route progress states exact cost and real route link" do
    get admin_user_path(@student)

    assert_response :success
    assert_select "h1", text: "Needle Student"
    assert_select "[data-route-id='#{@route.id}']", text: /Private Algebra/
    assert_select "[data-route-id='#{@route.id}']", text: /1.*2/m
    assert_select "[data-route-cost]", text: /0\.0500/
    assert_select "[data-route-cost-status]", text: /Pricing incomplete/
    assert_select "a[href='#{learning_routes_engine.route_path(@route)}']"
    assert_no_match(/purchase|revenue|profit|fee|quote|payment/i, response.body)
    assert_no_match(/PRIVATE PROMPT|PRIVATE RESPONSE|password_digest|remember_token/i, response.body)
  end

  test "drill-down paginates routes independently from the user index" do
    profile = @student.learning_profile
    25.times { |index| profile.learning_routes.create!(topic: "Additional Route #{index}") }

    get admin_user_path(@student)

    assert_select "[data-route-id]", count: 25
    assert_select "a[href*='route_page=2']"
  end

  test "unknown user is a private not found response" do
    get admin_user_path("00000000-0000-0000-0000-000000000000")

    assert_response :not_found
    assert_match(/private.*no-store/, response.headers["Cache-Control"])
    assert_equal "noindex, nofollow", response.headers["X-Robots-Tag"]
  end
end
