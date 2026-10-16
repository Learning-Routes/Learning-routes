require "test_helper"

# STEP 37 §4: Google sign-in creates accounts, links to existing ones and rotates
# the password of an unverified local account. The own_password flag on each path
# is covered in settings_password_test.rb; these pin the rest.
class Core::OmniauthCallbacksControllerTest < ActionDispatch::IntegrationTest
  CALLBACK = "/auth/google_oauth2/callback".freeze

  test "a new Google user is created verified, with a random password, and signed in" do
    assert_difference -> { Core::User.count } => 1, -> { Core::Session.count } => 1 do
      get CALLBACK, env: { "omniauth.auth" => google_auth("new-google@example.test", uid: "g-new") }
    end

    user = Core::User.find_by!(email: "new-google@example.test")
    assert_equal ["google_oauth2", "g-new"], [user.provider, user.uid]
    assert user.email_verified?
    assert user.password_digest.present?
    assert_not user.authenticate("password123")
    assert_redirected_to profile_path
    get settings_path
    assert_response :success
  end

  test "an existing verified account is linked and its password is not changed" do
    user = create_test_user(email: "verified@example.test", email_verified_at: 2.days.ago)
    digest = user.password_digest

    assert_no_difference -> { Core::User.count } do
      get CALLBACK, env: { "omniauth.auth" => google_auth("verified@example.test", uid: "g-linked") }
    end

    user.reload
    assert_equal ["google_oauth2", "g-linked"], [user.provider, user.uid]
    assert_equal digest, user.password_digest
    assert user.authenticate("password123")
    assert_redirected_to profile_path
  end

  # The pre-hijack attack: someone registers the victim's email locally with a
  # password they know, never verifies it, and waits for the real owner to
  # sign in with Google. Linking must lock the squatter out.
  test "an unverified local account gets its password rotated, is verified, and is linked" do
    user = create_test_user(email: "squatted@example.test", password: "squatter-pass")

    get CALLBACK, env: { "omniauth.auth" => google_auth("squatted@example.test", uid: "g-owner") }

    user.reload
    assert_equal ["google_oauth2", "g-owner"], [user.provider, user.uid]
    assert user.email_verified?
    assert_not user.authenticate("squatter-pass"), "the squatter's password must stop working"
    assert_redirected_to profile_path
  end

  test "an unverified local account is not linked when Google does not verify the email either" do
    user = create_test_user(email: "unproven@example.test", password: "squatter-pass")

    get CALLBACK, env: { "omniauth.auth" => google_auth("unproven@example.test", uid: "g-x", verified: false) }

    user.reload
    assert_nil user.uid
    assert user.authenticate("squatter-pass")
    assert_redirected_to Core::Engine.routes.url_helpers.sign_in_path
  end

  test "a failed create logs [OAUTH FAILURE] without the email and signs nobody in" do
    log = StringIO.new
    original = Rails.logger
    Rails.logger = ActiveSupport::Logger.new(log)
    begin
      assert_no_difference -> { Core::User.count } do
        # A one-letter name fails validation, so create! raises RecordInvalid.
        get CALLBACK, env: { "omniauth.auth" => google_auth("private-person@example.test", uid: "g-bad", name: "A") }
      end
    ensure
      Rails.logger = original
    end

    assert_redirected_to Core::Engine.routes.url_helpers.sign_in_path
    assert_includes log.string, "[OAUTH FAILURE]"
    assert_not_includes log.string, "private-person"
  end

  private

  def google_auth(email, uid:, name: "Google Person", verified: true)
    OmniAuth::AuthHash.new(
      provider: "google_oauth2", uid: uid,
      info: { email: email, name: name, email_verified: verified }
    )
  end
end
