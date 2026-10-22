require "test_helper"

# STEP 41 §2.3. The closing sheet asks "¿Qué quieres aprender?" and carries the
# answer: signed in, straight to the wizard with its first question filled;
# signed out, through sign-up (which keeps it in the session) to the same place.
class LandingTopicTest < ActionDispatch::IntegrationTest
  TOPIC = "Portugués para viajar".freeze

  test "the closing form points at the wizard when signed in and at sign-up when not" do
    get root_path
    assert_select "form.lp-ask[action='#{core.sign_up_path}'] input[name='topic']"

    sign_in_as(create_test_user(email_verified_at: Time.current))
    get root_path
    assert_select "form.lp-ask[action='#{new_route_wizard_path}'] input[name='topic']"
  end

  test "the wizard reads the topic and fills its first question" do
    sign_in_as(create_test_user(email_verified_at: Time.current))

    get new_route_wizard_path(topic: TOPIC)

    assert_response :success
    assert_select "input[data-route-wizard-target='customInput'][value=?]", TOPIC
  end

  test "without a topic the first question starts empty" do
    sign_in_as(create_test_user(email_verified_at: Time.current))

    get new_route_wizard_path

    assert_select "input[data-route-wizard-target='customInput']:not([value])"
  end

  test "a topic is cut to the field's 200 characters" do
    sign_in_as(create_test_user(email_verified_at: Time.current))

    get new_route_wizard_path(topic: "a" * 500)

    assert_select "input[data-route-wizard-target='customInput'][value=?]", "a" * 200
  end

  # A new account verifies its email before the wizard opens; the topic waits
  # in the session through that, and the verification link lands in the wizard.
  test "signed out, the topic survives sign-up and email verification and lands in the wizard" do
    get core.sign_up_path(topic: TOPIC)
    assert_response :success

    post core.sign_up_path, params: { user: { name: "Nueva", email: "nueva-#{SecureRandom.hex(4)}@example.com",
                                              password: "password123", password_confirmation: "password123" } }
    assert_redirected_to new_route_wizard_path(topic: TOPIC)
    follow_redirect!
    assert_redirected_to core.verify_pending_path

    get core.verify_email_path(Core::User.order(:created_at).last.generate_token_for(:email_verification))
    assert_redirected_to new_route_wizard_path(topic: TOPIC)
    follow_redirect!
    assert_select "input[data-route-wizard-target='customInput'][value=?]", TOPIC
  end

  test "signed out, an existing student who signs in instead also lands in the wizard" do
    user = create_test_user(email_verified_at: Time.current)
    get core.sign_up_path(topic: TOPIC)

    sign_in_as(user)

    assert_redirected_to new_route_wizard_path(topic: TOPIC)
  end

  test "the topic is used once: once the wizard has it, a later sign-in goes where it always went" do
    user = create_test_user(email_verified_at: Time.current)
    get core.sign_up_path(topic: TOPIC)
    sign_in_as(user)
    follow_redirect!
    assert_select "input[data-route-wizard-target='customInput'][value=?]", TOPIC
    delete core.sign_out_path

    sign_in_as(user)

    assert_redirected_to profile_path
  end

  test "sign-up without a topic goes where it always went" do
    post core.sign_up_path, params: { user: { name: "Sin", email: "sin-#{SecureRandom.hex(4)}@example.com",
                                              password: "password123", password_confirmation: "password123" } }

    assert_redirected_to profile_path
  end
end
