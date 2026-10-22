require "test_helper"

# STEP 41 §3.3: settings on the foundations. Its sections are cards with body,
# its title a page title, its fields .input3 and its buttons .btn3 (save the
# primary, the password one the secondary), with no script painting over them.
class SettingsLookTest < ActionDispatch::IntegrationTest
  test "settings is built from the foundations" do
    user = create_test_user(email_verified_at: Time.current, locale: "es")
    LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
    sign_in_as(user)

    get settings_path

    assert_response :success
    assert_select "h1.page-title", text: I18n.t("settings.heading", locale: :es)
    assert_select "section.card3", minimum: 4
    %w[name email].each { |field| assert_select "input.input3[name$='[#{field}]']", 1 }
    assert_select "form[action='#{settings_password_path}'] input[type='password']" do |fields|
      fields.each { |f| assert_includes f["class"].to_s.split, "input3", "#{f['name']} is not an .input3" }
    end
    assert_select "[type='submit'].btn3:not(.btn3--secondary)", minimum: 1
    assert_select "[type='submit'].btn3.btn3--secondary", 1
    assert_select ".btn3[data-action*='submitOver'], .input3[data-action*='inputFocus']", 0
  end
end
