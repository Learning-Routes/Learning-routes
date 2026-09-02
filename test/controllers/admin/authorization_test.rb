require "test_helper"

class AdminAuthorizationTest < ActionDispatch::IntegrationTest
  ADMIN_PATHS = ["/admin", "/admin/users", "/admin/users/00000000-0000-0000-0000-000000000000"].freeze

  setup do
    Core::User.where(role: :owner).update_all(role: Core::User.roles[:student])
  end

  test "anonymous users receive a hard private 403 for every admin resource" do
    ADMIN_PATHS.each do |path|
      get path
      assert_private_forbidden
    end
  end

  test "students and teachers receive a hard private 403 without protected content" do
    %i[student teacher].each do |role|
      user = create_user(role: role)
      sign_in(user)

      ADMIN_PATHS.each do |path|
        get path
        assert_private_forbidden
        assert_no_match(/Registered users|Usuarios registrados|victim@example/, response.body)
      end
      delete "/sign_out"
    end
  end

  test "an unverified student receives a hard private 403 instead of a verification redirect" do
    user = create_user(role: :student, email_verified_at: nil)
    sign_in(user)

    get "/admin"

    assert_private_forbidden
  end

  test "owner receives private no-store responses and access is audited" do
    owner = create_user(role: :owner)
    sign_in(owner)

    get "/admin"

    assert_response :success
    assert_private_headers
    event = OwnerAuditEvent.order(:created_at).last
    assert_equal "owner.admin_access", event.action
    assert_equal owner.id, event.actor_user_id
    assert_equal({ "controller" => "admin/dashboard", "action" => "show" }, event.metadata)
  end

  test "JSON and unknown formats are denied without a redirect" do
    get "/admin.json"
    assert_private_forbidden
    assert_equal({ "error" => "forbidden" }, response.parsed_body)

    get "/admin", headers: { "Accept" => "text/plain" }
    assert_private_forbidden
  end

  private

  def create_user(role:, email_verified_at: Time.current)
    Core::User.create!(
      name: "Authorization User", email: "auth-#{SecureRandom.hex(4)}@example.test",
      password: "password123", password_confirmation: "password123",
      role: role, email_verified_at: email_verified_at
    )
  end

  def sign_in(user)
    post "/sign_in", params: { email: user.email, password: "password123" }
    assert_response :redirect
  end

  def assert_private_forbidden
    assert_response :forbidden
    assert_not response.redirect?
    assert_private_headers
  end

  def assert_private_headers
    assert_match(/private/, response.headers["Cache-Control"])
    assert_match(/no-store/, response.headers["Cache-Control"])
    assert_equal "no-cache", response.headers["Pragma"]
    assert_equal "noindex, nofollow", response.headers["X-Robots-Tag"]
  end
end
