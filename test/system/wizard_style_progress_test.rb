require "application_system_test_case"

# Found while doing #59: updateStyleProgress() wrote textContent on the
# styleProgress wrapper, so the first answer replaced the progress bar and the
# "Pregunta N de 12" line with a bare "1 de 12", and later updates found no
# styleQuestionNum target. The bar and the counter each update in place.
class WizardStyleProgressTest < ApplicationSystemTestCase
  FILL = "[data-route-wizard-target='styleProgressFill']".freeze
  COUNTER = "[data-route-wizard-target='styleQuestionNum']".freeze

  def setup
    @user = create_test_user(email_verified_at: Time.current, locale: "es")
    # Saved time answers pre-select step 3; no saved style, so the quiz shows.
    LearningRoutesEngine::LearningProfile.create!(
      user: @user, current_level: "beginner", weekly_hours: 10, session_minutes: 30
    )
    sign_in_through_ui
  end

  def teardown
    I18n.locale = I18n.default_locale
    super
  end

  test "answering style questions grows the bar and advances the counter" do
    visit new_route_wizard_path
    find("[data-topic='music']").click
    find("[data-route-wizard-target='topicDetailInput']").fill_in(with: "teoria musica")
    continue_to "[data-level='beginner']"
    find("[data-level='beginner']").click
    continue_to "[data-goal='personal']"
    find("[data-goal='personal']").click
    continue_to "[data-hours]"
    continue_to "[data-style-question='1'] [data-option='1v']"

    assert_equal 0.0, fill_percent
    assert_text "Pregunta 1 de 12"

    find("[data-style-question='1'] [data-option='1v']").click
    assert_selector "[data-style-question='2'] [data-option='2a']", visible: true, wait: 5
    after_one = fill_percent

    find("[data-style-question='2'] [data-option='2a']").click
    assert_selector "[data-style-question='3'] [data-option='3r']", visible: true, wait: 5
    after_two = fill_percent

    assert_operator after_one, :>, 0
    assert_operator after_two, :>, after_one
    assert_selector COUNTER, text: "3"
    assert_text "Pregunta 3 de 12"
  end

  private

  def fill_percent
    assert_selector FILL, visible: :all
    page.evaluate_script("document.querySelector(\"#{FILL}\").style.width").to_f
  end

  def continue_to(selector)
    find("[data-route-wizard-target='continueBtn']:not([disabled])").click
    assert_selector selector, visible: true, wait: 5
  end

  def sign_in_through_ui
    visit core.sign_in_path
    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    assert_field "email", with: @user.email
    find("input[type='submit']").click
    assert_no_current_path core.sign_in_path, wait: 5
  end
end
