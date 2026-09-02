require "test_helper"

class AdminIsolationTest < ActionDispatch::IntegrationTest
  setup do
    Core::User.where(role: :owner).update_all(role: Core::User.roles[:student])
    @owner = create_test_user(role: :owner, email_verified_at: Time.current)
    @student = create_test_user(name: "Denied Student", email: "denied@example.test", email_verified_at: Time.current)
    @victim = create_test_user(name: "Victim Person", email: "victim-private@example.test")
  end

  test "alternating owner and student sessions never caches or leaks the owner response" do
    owner_session = open_session { |session| session.sign_in_as(@owner) }
    student_session = open_session { |session| session.sign_in_as(@student) }

    owner_session.get admin_users_path, params: { search: "victim-private" }
    assert_includes owner_session.response.body, @victim.email
    assert_private(owner_session.response)

    student_session.get admin_users_path, params: { search: "victim-private" }
    assert_equal 403, student_session.response.status
    assert_not_includes student_session.response.body, @victim.email
    assert_private(student_session.response)
  end

  test "one user detail contains no other user's identity or sensitive columns" do
    sign_in_as(@owner)
    other = create_test_user(name: "Other Secret", email: "other-secret@example.test")

    get admin_user_path(@victim)

    assert_response :success
    assert_no_match(/#{Regexp.escape(other.email)}|password_digest|remember_token|PRIVATE PROMPT|PRIVATE RESPONSE/, response.body)
  end

  private

  def assert_private(current_response)
    assert_match(/private/, current_response.headers["Cache-Control"])
    assert_match(/no-store/, current_response.headers["Cache-Control"])
    assert_equal "noindex, nofollow", current_response.headers["X-Robots-Tag"]
  end
end
