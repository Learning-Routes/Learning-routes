require "application_system_test_case"

# STEP 38 §3 deliverable, not part of the suites (it lives outside test/):
#   STEP38_OUT=tmp/step38/after bin/rails test script/step38/palette_screenshots_test.rb
# Writes <page>-<theme>-<width>.png for the owner's palette review. Test data
# only: the repository is public.
class Step38PaletteScreenshotsTest < ApplicationSystemTestCase
  OUT = Rails.root.join(ENV.fetch("STEP38_OUT", "tmp/step38"))
  SHOW_ALL_SECTIONS = <<~JS.freeze
    const s = document.createElement("style");
    s.textContent = ".lesson-section{display:block!important;opacity:1!important;transform:none!important}";
    document.head.appendChild(s);
  JS

  SECTIONS = [
    { "type" => "concept", "title" => "Concepto", "body" => "Un párrafo de ejemplo para la lección." },
    { "type" => "example", "title" => "Ejemplo", "body" => "Un ejemplo resuelto." },
    { "type" => "tip", "title" => "Consejo", "body" => "Un consejo." },
    { "type" => "flashcards", "title" => "Tarjetas", "cards" => [{ "front" => "obrigado", "back" => "gracias" }] },
    { "type" => "fill_blank", "title" => "Completa", "sentence" => "Bom ___", "blanks" => ["dia"] },
    { "type" => "drag_drop", "title" => "Empareja", "pairs" => [{ "term" => "hola", "definition" => "hello" }, { "term" => "gracias", "definition" => "thanks" }] },
    { "type" => "scenario", "title" => "Elige", "situation" => "Una situación.", "options" => [{ "label" => "A", "consequence" => "Una consecuencia." }] },
    { "type" => "simulation", "title" => "Simulación", "variables" => [], "formula" => "x" },
    { "type" => "code_playground", "title" => "Código", "language" => "python", "code" => "print(1)", "expected_output" => "1" },
    { "type" => "check", "question" => "¿Cuál significa \"por favor\"?",
      "options" => [{ "label" => "thank you", "correct" => false }, { "label" => "please", "correct" => true }], "explanation" => "Es please." },
    { "type" => "summary", "title" => "Resumen", "body" => "Cierre.", "key_points" => ["Uno", "Dos"] }
  ].freeze

  # Production logs strict-loading violations instead of raising
  # (config/environments/production.rb); community and feed lazy-load users.
  def setup
    @strict = ActiveRecord.action_on_strict_loading_violation
    ActiveRecord.action_on_strict_loading_violation = :log
    FileUtils.mkdir_p(OUT)
    Core::User.where(role: :owner).update_all(role: Core::User.roles[:student])
    @user = create_test_user(name: "Owner Review", email: "owner-review@example.test", role: :owner, email_verified_at: Time.current, locale: "es")
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = build_route(profile, "Ruta de Música", "Música", completed: 1)
    build_route(profile, "Ruta de Ciencias", "Ciencias", completed: 0)
    build_route(profile, "Ruta de Diseño", "Diseño", completed: 3)
    @lesson = @route.route_steps.find_by!(position: 1)
    ContentEngine::AiContent.create!(route_step: @lesson, content_type: :text, body: "## Concepto: x\nbody")
    exam_step = @route.route_steps.find_by!(position: 2)
    exam_step.update!(content_type: :assessment)
    @assessment = Assessments::Assessment.create!(route_step: exam_step, assessment_type: :level_up, passing_score: 70)
    Assessments::Question.create!(assessment: @assessment, body: "¿Cuál significa \"por favor\"?",
      question_type: :multiple_choice, options: %w[please thanks sorry], correct_answer: "please", difficulty: 1, bloom_level: 1)
    @exam_step = exam_step
    @failed = @route.route_steps.find_by!(position: 3)
    @review = @route.route_steps.find_by!(position: 4)
    @review.update!(content_type: :review)
    sign_in(@user)
  end

  test "capture every page that STEP 38 §3 recolours" do
    pages = {
      "landing" => -> { root_path },
      "profile" => -> { profile_path },
      "profile-achievements" => -> { open_profile_tab(I18n.t("profile.tabs.achievements", locale: :es)) },
      "profile-activity" => -> { open_profile_tab(I18n.t("profile.tabs.activity", locale: :es)) },
      "community" => -> { community_path },
      "feed" => -> { community_engine.feed_path },
      "notifications" => -> { community_engine.notifications_path },
      "route-list" => -> { learning_routes_engine.route_path(@route) },
      "lesson" => -> { learning_routes_engine.route_step_path(@route, @lesson) },
      "assessment-step" => -> { learning_routes_engine.route_step_path(@route, @exam_step) },
      "exam" => -> { assessments.assessment_path(@assessment) },
      "content-failed" => -> { fail_step!(@failed) && learning_routes_engine.route_step_path(@route, @failed) },
      "review-step" => -> { learning_routes_engine.route_step_path(@route, @review) },
      "wizard" => -> { new_route_wizard_path },
      "settings" => -> { settings_path }
    }
    %w[light dark].each do |theme|
      @user.update!(theme: theme)
      { 1440 => 1000, 390 => 844 }.each do |width, height|
        pages.each do |name, path|
          next if width == 390 && !%w[landing profile lesson].include?(name)
          tall = name == "lesson" ? 6000 : height
          page.driver.browser.manage.window.resize_to(width, tall)
          capture(name, theme, width) do
            target = instance_exec(&path)
            visit target unless name.start_with?("profile-")
          end
        end
      end
      # Signed-out pages read the theme cookie.
      page.driver.browser.manage.window.resize_to(1440, 1000)
      sign_out_keeping(theme) do
        capture("sign-in", theme, 1440) { visit core.sign_in_path }
        capture("sign-up", theme, 1440) { visit core.sign_up_path }
      end
    end
  end

  def teardown
    ActiveRecord.action_on_strict_loading_violation = @strict
    super
  end

  private

  def capture(name, theme, width)
    yield
    assert_selector "html[data-theme='#{theme}']", visible: :all, wait: 5
    page.execute_script(SHOW_ALL_SECTIONS) if name == "lesson"
    # The step body is a lazy frame; wait for the failed state, not the skeleton.
    assert_text I18n.t("learning_engine.content_failed.title", locale: :es), wait: 15 if name == "content-failed"
    sleep 1.2 # entrance animations
    page.save_screenshot(OUT.join("#{name}-#{theme}-#{width}.png").to_s)
  rescue StandardError, Minitest::Assertion => e
    warn "[step38] #{name} #{theme} #{width}: #{e.class}: #{e.message.lines.first}"
  end

  # Earlier pages prefetch later steps and claim their generation, so the failed
  # state is set again right before it is shown.
  def fail_step!(step)
    step.update!(metadata: { "content_error" => "OpenAI request failed: boom", "content_attempts" => 1,
                             "content_failed_at" => Time.current.iso8601, "content_generating" => false })
  end

  def open_profile_tab(label)
    visit profile_path
    click_on label
    sleep 1.5 # the tab's frame loads
    page.execute_script("document.querySelector('[role=tablist]')?.scrollIntoView({block: 'start'})")
  end

  def sign_out_keeping(theme)
    page.driver.browser.manage.delete_all_cookies
    visit core.sign_in_path
    page.driver.browser.manage.add_cookie(name: "theme", value: theme)
    yield
  ensure
    sign_in(@user)
  end

  def build_route(profile, title, subject, completed:)
    route = LearningRoutesEngine::LearningRoute.create!(learning_profile: profile, topic: title, subject_area: subject,
                                                        locale: "es", status: :active)
    preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: route.id, access_state: :preview)
    %w[nv1 nv1 nv2 nv2 nv3].each_with_index do |level, i|
      route.route_steps.create!(
        route_module: preview, title: "Paso #{i + 1}", position: i, level: level, bloom_level: 1,
        content_type: :lesson, delivery_format: "text", status: i < completed ? :completed : :available,
        metadata: { "parsed_sections" => SECTIONS.map(&:deep_dup), "content_ready" => true }
      )
    end
    route
  end

  def sign_in(user)
    page.driver.browser.manage.delete_all_cookies
    visit core.sign_in_path
    fill_in "email", with: user.email
    fill_in "password", with: "password123"
    assert_field "email", with: user.email
    find("input[type='submit']").click
    assert_no_current_path core.sign_in_path, wait: 5
  end
end
