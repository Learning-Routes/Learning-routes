require "application_system_test_case"

# STEP 38 §1: the owner chose "Desarrollo web", changed his mind to "Música",
# and got "Ruta de Desarrollo Web". The tiles toggled independently, so the first
# choice stayed selected and the route builder took `topics.first`. A wizard
# route has one subject: the last tile chosen is the topic.
class WizardTopicChoiceTest < ApplicationSystemTestCase
  def setup
    @user = create_test_user(email_verified_at: Time.current, locale: "es")
    # Saved style and time answers skip the 12-question quiz; the topic is what this test is about.
    LearningRoutesEngine::LearningProfile.create!(
      user: @user, current_level: "beginner", weekly_hours: 10, session_minutes: 30,
      saved_style_answers: (1..12).to_h { |q| [q.to_s, "#{q}v"] },
      saved_style_result: { "dominant" => "visual" }
    )
    sign_in_through_ui
  end

  def teardown
    I18n.locale = I18n.default_locale
    super
  end

  test "changing the topic builds the route on the last choice" do
    visit new_route_wizard_path
    find("[data-topic='web_dev']").click
    find("[data-topic='music']").click

    assert_selector "[data-topic='music'][aria-checked='true']"
    assert_selector "[data-topic='web_dev'][aria-checked='false']"

    find("[data-route-wizard-target='topicDetailInput']").fill_in(with: "teoria musica")
    continue_to "[data-level='beginner']"
    find("[data-level='beginner']").click
    continue_to "[data-goal='personal']"
    find("[data-goal='personal']").click
    continue_to "[data-hours]"
    continue_to "[data-route-wizard-target='savedStyleBanner']"
    continue_to "[data-pace='relaxed']"
    find("[data-pace='relaxed']").click
    find("[data-route-wizard-target='continueBtn']").click

    request = wait_for_route_request
    assert_equal ["music"], request.topics

    WizardRouteGenerationJob.perform_now(request.id)
    route = LearningRoutesEngine::LearningRoute.find(request.reload.learning_route_id)
    assert_match(/Música|Music/, route.topic)
    assert_no_match(/Web/, route.topic)
  end

  private

  def continue_to(selector)
    find("[data-route-wizard-target='continueBtn']:not([disabled])").click
    assert_selector selector, visible: true, wait: 5
  end

  def wait_for_route_request
    Timeout.timeout(10) do
      loop do
        found = RouteRequest.where(user_id: @user.id).first
        return found if found
        sleep 0.1
      end
    end
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
