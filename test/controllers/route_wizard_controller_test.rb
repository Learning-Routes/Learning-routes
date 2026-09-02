require "test_helper"

class RouteWizardControllerTest < ActionDispatch::IntegrationTest
  # Owns its user — see the note in test_helper.rb. The wizard requires a
  # verified email, which is now set at creation instead of being patched onto
  # whichever user the class happened to adopt.
  def setup
    @user = create_test_user(email_verified_at: Time.current)
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
          "4" => "4k", "5" => "5v", "6" => "6a",
          "7" => "7r", "8" => "8k", "9" => "9v",
          "10" => "10a", "11" => "11r", "12" => "12k"
        }
      }
    }

    assert_equal initial_count + 1, RouteRequest.count
    rr = RouteRequest.order(created_at: :desc).first
    assert_equal ["programming", "web_dev"], rr.topics
    assert_equal "beginner", rr.level
    assert_equal "steady", rr.pace
    assert_equal 10, rr.weekly_hours
    assert_equal 30, rr.session_minutes
    assert_equal 12, rr.learning_style_answers.keys.length
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
          "4" => "4v", "5" => "5a", "6" => "6a",
          "7" => "7v", "8" => "8v", "9" => "9v",
          "10" => "10a", "11" => "11a", "12" => "12v"
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

  # --- Regression: turbo_stream validation-failure branch (P0-2) ---
  #
  # The test above passes even when the turbo_stream branch is broken: without an
  # explicit turbo_stream Accept header the request falls into the `format.html`
  # branch, which never touches the offending code. The bare `tag.div` in the
  # turbo_stream branch raised NoMethodError on EVERY validation failure because
  # `self` there is the controller, which has no TagHelper.
  test "create with invalid params renders the error banner as turbo_stream" do
    sign_in(@user)

    post "/routes/create", params: {
      route_request: {
        topics: [],
        custom_topic: "",
        level: "beginner",
        pace: "steady",
        goals: ["career"]
      }
    }, as: :turbo_stream

    assert_response :unprocessable_entity
    assert_match "wizard-error-banner", response.body
    assert_match "turbo-stream", response.body
  end

  # --- Regression: strict loading on the profile lookup (P0-1) ---
  #
  # The pre-existing "new renders wizard page" test passes vacuously because the
  # test user has no LearningProfile — `current_user.learning_profile` returns nil
  # without ever loading the association. Only a user who HAS a profile triggers
  # the lazy has_one traversal that raised StrictLoadingViolationError in
  # production. test.rb runs strict_loading_mode :all so this genuinely reproduces.
  test "new renders for a user who already has a learning profile" do
    LearningRoutesEngine::LearningProfile.find_or_create_by!(user: @user) do |p|
      p.current_level = "beginner"
    end

    sign_in(@user)
    get "/routes/create"

    assert_response :success
  end

  # --- Regression: hide_navbar content_for (P0-5) ---
  #
  # `content_for(:hide_navbar) { true }` stored nothing, because capture() returns
  # nil for a non-String block value — so the layout's `unless content_for?` was
  # always false and the fixed navbar rendered over the full-screen wizard.
  test "new hides the app navbar" do
    sign_in(@user)
    get "/routes/create"

    assert_response :success
    assert_no_match "app-mobile-menu", response.body
  end

  # --- Regression: #new / #create predicate symmetry (P0-4) ---

  test "new shows the generating state for a recent in-flight request" do
    RouteRequest.create!(
      user: @user, topics: ["programming"], level: "beginner",
      pace: "steady", goals: ["career"], status: "pending"
    )

    sign_in(@user)
    get "/routes/create"

    assert_response :success
    # #create would refuse to start another request, so #new must not offer a
    # fresh form — that mismatch is what bounced users to a dead spinner.
    assert_match "generating-state", response.body
  end

  test "new offers a fresh form once an abandoned request has gone stale" do
    stale = RouteRequest.create!(
      user: @user, topics: ["programming"], level: "beginner",
      pace: "steady", goals: ["career"], status: "pending"
    )
    stale.update_column(:created_at, (RouteRequest::STALE_AFTER + 5.minutes).ago)

    sign_in(@user)
    get "/routes/create"

    assert_response :success
    assert_no_match "generating-state", response.body
  end

  test "create is not blocked by a stale abandoned request" do
    stale = RouteRequest.create!(
      user: @user, topics: ["programming"], level: "beginner",
      pace: "steady", goals: ["career"], status: "pending"
    )
    stale.update_column(:created_at, (RouteRequest::STALE_AFTER + 5.minutes).ago)

    sign_in(@user)
    initial_count = RouteRequest.count

    post "/routes/create", params: {
      route_request: {
        topics: ["web_dev"], level: "beginner", pace: "steady", goals: ["career"]
      }
    }

    assert_equal initial_count + 1, RouteRequest.count
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
