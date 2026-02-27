require "test_helper"

class RouteWizardControllerTest < ActionDispatch::IntegrationTest
  def setup
    @user = Core::User.first || Core::User.create!(
      name: "Test User",
      email: "test-wizard@example.com",
      password: "password123",
      password_confirmation: "password123"
    )
  end

  def sign_in(user)
    post "/sign_in", params: {
      email: user.email,
      password: "password123"
    }
  end

  # --- Authentication ---

  test "new requires authentication" do
    get "/routes/create"
    assert_response :redirect
  end

  test "create requires authentication" do
    post "/routes/create", params: {
      route_request: {
        topics: ["programming"],
        level: "beginner",
        pace: "steady",
        goals: ["career"]
      }
    }
    assert_response :redirect
  end

  # --- New action ---

  test "new renders wizard page when signed in" do
    sign_in(@user)
    get "/routes/create"
    assert_response :success
  end

  # --- Create action ---

  test "create with valid params creates route request" do
    sign_in(@user)

    initial_count = RouteRequest.count

    post "/routes/create", params: {
      route_request: {
        topics: ["programming", "web_dev"],
        custom_topic: "",
        level: "beginner",
        pace: "steady",
        goals: ["career", "personal"],
        weekly_hours: "10",
        session_minutes: "30",
        learning_style_answers: {
          "1" => "1v", "2" => "2a", "3" => "3r",
          "4" => "4k", "5" => "5v", "6" => "6a"
        }
      }
    }

    assert_equal initial_count + 1, RouteRequest.count
    rr = RouteRequest.last
    assert_equal ["programming", "web_dev"], rr.topics
    assert_equal "beginner", rr.level
    assert_equal "steady", rr.pace
    assert_equal 10, rr.weekly_hours
    assert_equal 30, rr.session_minutes
    assert_equal 6, rr.learning_style_answers.keys.length
  end

  test "create saves preferences to learning profile" do
    sign_in(@user)

    post "/routes/create", params: {
      route_request: {
        topics: ["data_science"],
        level: "intermediate",
        pace: "intensive",
        goals: ["project"],
        weekly_hours: "15",
        session_minutes: "45",
        learning_style_answers: {
          "1" => "1v", "2" => "2v", "3" => "3v",
          "4" => "4v", "5" => "5a", "6" => "6a"
        }
      }
    }

    profile = LearningRoutesEngine::LearningProfile.find_by(user: @user)
    assert_not_nil profile
    assert_equal "intensive", profile.preferred_pace
    assert_equal 15, profile.weekly_hours
    assert_equal 45, profile.session_minutes
    assert profile.saved_style_answers.present?
  end

  test "create without topics returns error" do
    sign_in(@user)

    post "/routes/create", params: {
      route_request: {
        topics: [],
        custom_topic: "",
        level: "beginner",
        pace: "steady",
        goals: ["career"]
      }
    }

    assert_includes [200, 422], response.status
  end

  # --- Status action ---

  test "status returns generating json" do
    sign_in(@user)

    rr = RouteRequest.create!(
      user: @user,
      topics: ["programming"],
      level: "beginner",
      pace: "steady",
      goals: ["career"],
      status: "generating"
    )

    get "/routes/create/status/#{rr.id}", headers: { "Accept" => "application/json" }
    assert_response :success

    json = JSON.parse(response.body)
    assert_equal "generating", json["status"]

    rr.destroy
  end

  test "status returns completed with redirect url" do
    sign_in(@user)

    rr = RouteRequest.create!(
      user: @user,
      topics: ["programming"],
      level: "beginner",
      pace: "steady",
      goals: ["career"],
      status: "completed"
    )

    get "/routes/create/status/#{rr.id}", headers: { "Accept" => "application/json" }
    assert_response :success

    json = JSON.parse(response.body)
    assert_equal "completed", json["status"]
    assert json["redirect_url"].present?

    rr.destroy
  end
end
