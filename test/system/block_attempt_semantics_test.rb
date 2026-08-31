require "application_system_test_case"
require "timeout"

class BlockAttemptSemanticsTest < ApplicationSystemTestCase
  BA = LearningRoutesEngine::BlockAttempt

  PAIRS = [
    { "term" => "Instancia", "definition" => "Computadora virtual" },
    { "term" => "AMI", "definition" => "Plantilla de arranque" },
    { "term" => "Región", "definition" => "Área geográfica" },
    { "term" => "Volumen", "definition" => "Disco persistente" },
    { "term" => "Clave", "definition" => "Credencial de acceso" }
  ].freeze

  DRAG_DROP_INDEX = 1
  SECTIONS = [
    { "type" => "concept", "title" => "Intro", "body" => "..." },
    { "type" => "drag_drop", "title" => "Empareja", "pairs" => PAIRS }
  ].freeze

  def setup
    @user = Core::User.create!(
      name: "Browser Blocks", email: "browser-blocks-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, locale: "es"
    )
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "AWS", locale: "es", status: :active
    )
    @step = @route.route_steps.create!(
      title: "EC2", position: 0, status: :available, content_type: "lesson",
      delivery_format: "text", level: 1, bloom_level: 1,
      metadata: { "parsed_sections" => SECTIONS.map(&:deep_dup), "content_ready" => true }
    )
    ContentEngine::AiContent.create!(
      route_step: @step, content_type: :text, body: "## Concepto: x\nbody"
    )

    sign_in_through_ui
    visit learning_routes_engine.route_step_path(@route, @step)
    find("[data-interactive-lesson-target='continueBtn']").click
    assert_selector "[data-controller='drag-drop'] [data-drag-drop-target='term']", visible: true

    page.execute_script(<<~JS)
      window.__blockResults = []
      document.addEventListener("block:graded", (event) => {
        window.__blockResults.push(event.detail)
      })
    JS
  end

  def teardown
    I18n.locale = I18n.default_locale
    super
  end

  test "three wrong placements do not consume attempts or release navigation" do
    3.times do |event_count|
      trigger_match(term_index: "0", definition_index: "1")
      wait_for_result_count(event_count + 1)
    end

    attempt = attempt_for
    assert_equal 0, attempt.attempts
    assert_not attempt.released?
    assert_not attempt.satisfied?
    assert_selector ".lesson-nav-footer", text: /Responde para continuar|Answer to continue/
  end

  test "three completed wrong rounds release without recording a pass" do
    result_count = 0

    3.times do
      PAIRS.each_index do |term_index|
        trigger_match(
          term_index: term_index.to_s,
          definition_index: ((term_index + 1) % PAIRS.size).to_s
        )
        result_count += 1
        wait_for_result_count(result_count)
      end
    end

    attempt = attempt_for
    assert_equal 3, attempt.attempts
    assert attempt.released?
    assert_equal false, attempt.correct
    assert attempt.satisfied?

    result = page.evaluate_script("window.__blockResults.at(-1)")
    assert_equal true, result["released"]
    assert_equal true, result["satisfied"]
    assert_equal false, result["correct"]
  end

  private

  def sign_in_through_ui
    visit core.sign_in_path
    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    find("input[type='submit']").click
    assert_no_current_path core.sign_in_path
  end

  def trigger_match(term_index:, definition_index:)
    page.execute_script(<<~JS)
      (() => {
        const root = document.querySelector("[data-controller='drag-drop']")
        const controller = window.Stimulus.getControllerForElementAndIdentifier(root, "drag-drop")
        const zone = root.querySelector(
          `[data-drag-drop-target="dropZone"][data-def-index="#{definition_index}"]`
        )
        controller.checkMatch("#{term_index}", "#{definition_index}", zone)
      })()
    JS
  end

  def wait_for_result_count(expected)
    Timeout.timeout(Capybara.default_max_wait_time) do
      sleep 0.05 until page.evaluate_script("window.__blockResults.length") >= expected
    end
  end

  def attempt_for
    BA.find_by!(user: @user, route_step: @step, section_index: DRAG_DROP_INDEX)
  end
end
