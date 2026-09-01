require "test_helper"

class OwnerPromotionAuthenticationTest < ActionDispatch::IntegrationTest
  setup do
    Core::User.where(role: :owner).update_all(role: Core::User.roles[:student])
    OwnerAuditEvent.delete_all
    @candidate = create_test_user(email_verified_at: Time.current)
  end

  test "promotion revokes old session and remember-me authentication" do
    post core.sign_in_path, params: {
      email: @candidate.email, password: "password123", remember_me: "1"
    }
    assert_response :redirect
    remembered_cookie = cookies[:remember_token]
    remembered_token = @candidate.reload.remember_token
    assert remembered_cookie.present?
    assert remembered_token.present?

    Owner::Promotion.call(email: @candidate.email, password: "password123")

    assert_nil @candidate.reload.remember_token
    assert_empty @candidate.sessions

    get profile_path
    assert_redirected_to core.sign_in_path

    replay = open_session
    replay.cookies[:remember_token] = remembered_cookie
    replay.get profile_path
    assert_redirected_to core.sign_in_path
    assert_empty Core::Session.where(user_id: @candidate.id)
  end

  test "valid remember-me authentication recovers through the transactional path" do
    post core.sign_in_path, params: {
      email: @candidate.email, password: "password123", remember_me: "1"
    }
    assert_response :redirect
    @candidate.sessions.delete_all

    get profile_path

    assert_response :success
    assert_equal 1, Core::Session.where(user_id: @candidate.id).count
  end

  test "repeating promotion does not revoke a current owner's new credentials" do
    Owner::Promotion.call(email: @candidate.email, password: "password123")
    current_token = @candidate.remember!
    current_session = @candidate.sessions.create!(last_active_at: Time.current)

    Owner::Promotion.call(email: @candidate.email, password: "password123")

    assert_equal @candidate.id,
      Core::User.find_by_remember_credential(user_id: @candidate.id, raw_token: current_token)&.id
    assert Core::Session.exists?(current_session.id)
  end
end
