require "test_helper"

# STEP 38 §5: change the password from Settings; an account that signs in with
# Google and never chose a password (a random one since sign-up) creates one
# with only the new password, since Google already verified it.
class SettingsPasswordTest < ActionDispatch::IntegrationTest
  test "a wrong current password is refused and the password stays" do
    user = create_test_user(email_verified_at: Time.current)
    sign_in_as(user)

    patch settings_password_path, params: {
      current_password: "wrong-one", new_password: "brand-new-pass", new_password_confirmation: "brand-new-pass"
    }

    assert_response :unprocessable_entity
    assert user.reload.authenticate("password123")
    assert_not user.authenticate("brand-new-pass")
  end

  test "the right current password changes it" do
    user = create_test_user(email_verified_at: Time.current)
    sign_in_as(user)

    patch settings_password_path, params: {
      current_password: "password123", new_password: "brand-new-pass", new_password_confirmation: "brand-new-pass"
    }

    assert_redirected_to settings_path
    assert user.reload.authenticate("brand-new-pass")
  end

  test "a Google account creates a password without a current one and can then sign in with it" do
    user = google_user
    sign_in_as(user, password: "random-from-google")

    patch settings_password_path, params: { new_password: "my-own-pass", new_password_confirmation: "my-own-pass" }

    assert_redirected_to settings_path
    assert user.reload.own_password?
    delete Core::Engine.routes.url_helpers.sign_out_path
    sign_in_as(user, password: "my-own-pass")
    get settings_path
    assert_response :success
  end

  test "once it has its own password, a Google account needs the current one" do
    user = google_user(own_password: true)
    sign_in_as(user, password: "random-from-google")

    patch settings_password_path, params: { new_password: "my-own-pass", new_password_confirmation: "my-own-pass" }

    assert_response :unprocessable_entity
    assert_not user.reload.authenticate("my-own-pass")
  end

  test "creating a password still checks the confirmation" do
    user = google_user
    sign_in_as(user, password: "random-from-google")

    patch settings_password_path, params: { new_password: "my-own-pass", new_password_confirmation: "different" }

    assert_response :unprocessable_entity
    assert_not user.reload.own_password?
  end

  test "a blank new password is refused, not reported as saved" do
    user = google_user
    sign_in_as(user, password: "random-from-google")

    patch settings_password_path, params: { new_password: "", new_password_confirmation: "" }

    assert_response :unprocessable_entity
    assert_not user.reload.own_password?
    assert_select "h2", text: "Create password" # the failed attempt re-renders the same variant
  end

  test "a Google account's new password has the same 8-character minimum" do
    user = google_user
    sign_in_as(user, password: "random-from-google")

    patch settings_password_path, params: { new_password: "short", new_password_confirmation: "short" }

    assert_response :unprocessable_entity
    assert_not user.reload.authenticate("short")
  end

  # The step doc said sessions elsewhere are not touched; the owner kept the
  # existing sign-out of other sessions (2026-10-15). This one stays signed in.
  test "a new password ends the sessions elsewhere and keeps this one" do
    user = google_user
    elsewhere = user.sessions.create!(ip_address: "203.0.113.9", user_agent: "other device")
    sign_in_as(user, password: "random-from-google")

    patch settings_password_path, params: { new_password: "my-own-pass", new_password_confirmation: "my-own-pass" }

    assert_not Core::Session.exists?(elsewhere.id)
    assert_equal 1, user.sessions.count
    get settings_path
    assert_response :success
  end

  { "es" => ["Crear contraseña", "Cambiar contraseña"],
    "en" => ["Create password", "Change Password"] }.each do |locale, (create_heading, change_heading)|
    test "the Google variant asks only for the new password (#{locale})" do
      sign_in_as(google_user(locale: locale), password: "random-from-google")

      get settings_path

      assert_select "h2", text: create_heading
      assert_select "form[action='#{settings_password_path}'] input[name=current_password]", count: 0
      assert_select "form[action='#{settings_password_path}'] input[name=new_password]"
    end

    test "an account with its own password sees the change variant (#{locale})" do
      user = create_test_user(email_verified_at: Time.current, locale: locale)
      sign_in_as(user)

      get settings_path

      assert_select "h2", text: change_heading
      assert_select "form[action='#{settings_password_path}'] input[name=current_password]"
    end
  end

  test "a Google sign-up has no password of its own" do
    get "/auth/google_oauth2/callback", env: { "omniauth.auth" => google_auth("new-person@example.com") }

    assert_not Core::User.find_by!(email: "new-person@example.com").own_password?
  end

  test "linking Google onto an unverified account rotates its password and marks it not chosen" do
    user = create_test_user(email: "squatted@example.com")

    get "/auth/google_oauth2/callback", env: { "omniauth.auth" => google_auth("squatted@example.com") }

    assert_not user.reload.own_password?
  end

  test "linking Google onto a verified account keeps its own password" do
    user = create_test_user(email: "mine@example.com", email_verified_at: Time.current)

    get "/auth/google_oauth2/callback", env: { "omniauth.auth" => google_auth("mine@example.com") }

    assert user.reload.own_password?
  end

  test "a password chosen through the reset link is the account's own" do
    user = google_user
    token = user.generate_token_for(:password_reset)

    patch Core::Engine.routes.url_helpers.reset_password_path(token: token),
      params: { user: { password: "reset-pass-1", password_confirmation: "reset-pass-1" } }

    assert user.reload.own_password?
  end

  private

  def google_user(attrs = {})
    create_test_user({ password: "random-from-google", provider: "google_oauth2", uid: SecureRandom.hex(8),
                       email_verified_at: Time.current, own_password: false }.merge(attrs))
  end

  def google_auth(email)
    OmniAuth::AuthHash.new(
      provider: "google_oauth2", uid: SecureRandom.hex(8),
      info: { email: email, name: "Google Person", email_verified: true }
    )
  end
end
