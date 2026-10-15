require "application_system_test_case"

# STEP 38 §3 deliverable, not part of the suites (it lives outside test/):
#   bin/rails test script/step38/palette_screenshots_test.rb
# Writes tmp/step38/<page>-<theme>-<width>.png for the owner's palette review.
class Step38PaletteScreenshotsTest < ApplicationSystemTestCase
  OUT = Rails.root.join("tmp/step38")
  WIDTHS = { 1440 => 1000, 390 => 844 }.freeze

  SECTIONS = [
    { "type" => "concept", "title" => "Introducción", "body" => "Cuerpo de la introducción, con un párrafo de texto." },
    { "type" => "tip", "title" => "Consejo", "body" => "Un consejo." },
    { "type" => "check", "question" => "¿Cuál significa \"por favor\"?",
      "options" => [{ "label" => "thank you", "correct" => false }, { "label" => "please", "correct" => true }],
      "explanation" => "\"Por favor\" es \"please\"." },
    { "type" => "summary", "title" => "Resumen", "body" => "Cierre.", "key_points" => ["Uno", "Dos"] }
  ].freeze

  def setup
    FileUtils.mkdir_p(OUT)
    Core::User.where(role: :owner).update_all(role: Core::User.roles[:student])
    @user = create_test_user(name: "Owner Review", role: :owner, email_verified_at: Time.current, locale: "es")
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
    sign_in_through_ui
  end

  test "capture every page in both themes and widths" do
    pages = {
      "landing" => -> { root_path },
      "profile" => -> { profile_path },
      "journey" => -> { learning_routes_engine.journey_route_path(@route) },
      "lesson" => -> { learning_routes_engine.route_step_path(@route, @lesson) },
      "exam" => -> { assessments.assessment_path(@assessment) },
      "settings" => -> { settings_path },
      "admin" => -> { admin_root_path }
    }
    %w[light dark].each do |theme|
      @user.update!(theme: theme)
      WIDTHS.each do |width, height|
        page.driver.browser.manage.window.resize_to(width, height)
        pages.each do |name, path|
          visit instance_exec(&path)
          assert_selector "html[data-theme='#{theme}']", visible: :all, wait: 5
          sleep 1.2 # entrance animations and the journey's first layout
          page.save_screenshot(OUT.join("#{name}-#{theme}-#{width}.png").to_s)
        end
      end
    end
  end

  private

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

  def sign_in_through_ui
    visit core.sign_in_path
    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    assert_field "email", with: @user.email
    find("input[type='submit']").click
    assert_no_current_path core.sign_in_path, wait: 5
  end
end
