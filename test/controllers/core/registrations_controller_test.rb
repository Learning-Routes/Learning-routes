require "test_helper"

# STEP 37 §4: sign-up creates an unverified account and mails the verification link.
class Core::RegistrationsControllerTest < ActionDispatch::IntegrationTest
  SIGN_UP = Core::Engine.routes.url_helpers.sign_up_path

  setup { ActionMailer::Base.deliveries.clear }

  test "creates an unverified student, mails the verification link, and signs in" do
    assert_difference -> { Core::User.count } => 1, -> { Core::Session.count } => 1 do
      post SIGN_UP, params: { user: sign_up_params }
    end

    user = Core::User.find_by!(email: "newcomer@example.test")
    assert_not user.email_verified?
    assert user.student?
    assert user.authenticate("good-password")
    assert_redirected_to profile_path

    mail = ActionMailer::Base.deliveries.sole
    assert_equal ["newcomer@example.test"], mail.to
    assert_match %r{/verify_email/}, mail.body.encoded
  end

  test "a duplicate email is refused, whatever its case" do
    create_test_user(email: "taken@example.test")

    assert_no_difference -> { Core::User.count } do
      post SIGN_UP, params: { user: sign_up_params(email: "Taken@Example.test") }
    end

    assert_response :unprocessable_entity
    assert_empty ActionMailer::Base.deliveries
  end

  test "a password under 8 characters is refused" do
    assert_no_difference -> { Core::User.count } do
      post SIGN_UP, params: { user: sign_up_params(password: "short", password_confirmation: "short") }
    end

    assert_response :unprocessable_entity
    assert_empty ActionMailer::Base.deliveries
  end

  test "a password confirmation that does not match is refused" do
    assert_no_difference -> { Core::User.count } do
      post SIGN_UP, params: { user: sign_up_params(password_confirmation: "other-password") }
    end

    assert_response :unprocessable_entity
  end

  test "a role in the params is ignored" do
    post SIGN_UP, params: { user: sign_up_params(role: "owner") }

    assert Core::User.find_by!(email: "newcomer@example.test").student?
  end

  private

  def sign_up_params(overrides = {})
    { name: "New Comer", email: "newcomer@example.test",
      password: "good-password", password_confirmation: "good-password" }.merge(overrides)
  end
end
