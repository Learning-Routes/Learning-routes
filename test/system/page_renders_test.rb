require "application_system_test_case"

# STEP 41 §3: before and after renders of each page PR 5b moves onto the
# foundations, light and dark at 1440 and 390. Test data only; the files stay
# local. `SCREENSHOT=1 SCREENSHOT_PREFIX=before- [PAGES=profile,feed]
# bin/rails test test/system/page_renders_test.rb` writes
# tmp/redesign/pr5b/<prefix><page>-<theme>-<width>.png.
class PageRendersTest < ApplicationSystemTestCase
  M1 = ["Saludos", "Pronombres", "Ser y estar", "Números", "Direcciones", "Examen del módulo"].freeze
  M2 = ["Transporte", "En el hotel", "En el restaurante", "De compras", "Examen del módulo"].freeze

  def setup
    @user = Core::User.create!(name: "Ana Prueba", email: "pages-#{SecureRandom.hex(4)}@example.com",
                               password: "password123", password_confirmation: "password123",
                               email_verified_at: Time.current, locale: "es")
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = route_for(profile, "Portugués para viajar", done: 2)
    route_for(profile, "Python desde cero", done: 1)
    @step = @route.route_steps.find_by!(position: 2)
    ContentEngine::AiContent.create!(route_step: @step, content_type: :text,
                                     body: "## Ser y estar\n\nEn portugués, *ser* describe lo que algo es; *estar*, cómo está ahora.\n\n- Eu **sou** professora.\n- Eu **estou** cansada.")
    exam = @route.route_steps.find_by!(position: 5)
    @assessment = Assessments::Assessment.create!(route_step: exam, assessment_type: :level_up, passing_score: 70)
    Assessments::Question.create!(assessment: @assessment, body: "¿Cómo se dice «yo soy» en portugués?",
                                  question_type: :multiple_choice, options: ["A) Eu sou", "B) Eu estou"],
                                  correct_answer: "A", difficulty: 1, bloom_level: 1)
    CommunityEngine::Post.create!(user: @user, body: "Hoy terminé el módulo de saludos. ¿Alguien practica conmigo?")
    @shared = CommunityEngine::SharedRoute.create!(learning_route: @route, user: @user, visibility: "public",
                                                   share_token: SecureRandom.hex(8))
  end

  def teardown
    page.driver.browser.execute_cdp("Emulation.clearDeviceMetricsOverride")
  end

  test "renders of the pages" do
    skip "SCREENSHOT=1 to write the renders" unless ENV["SCREENSHOT"]

    wanted = ENV["PAGES"]&.split(",")
    pages = PAGES.select { |name, _| wanted.nil? || wanted.include?(name) }
    [[1440, 1000], [390, 844]].each do |width, height|
      page.driver.browser.execute_cdp("Emulation.setDeviceMetricsOverride",
                                      width: width, height: height, deviceScaleFactor: 1, mobile: width < 700)
      %w[light dark].each do |theme|
        Capybara.reset_sessions!
        @signed_in = false
        pages.each do |name, how|
          instance_exec(&how)
          set_theme(theme)
          shoot(name, theme, width)
        end
      end
    end
  end

  # Signed out first, then signed in; each entry visits its page.
  PAGES = {
    "sign_in" => -> { visit core.sign_in_path },
    "sign_up" => -> { visit core.sign_up_path },
    "terms" => -> { visit terms_path },
    "privacy" => -> { visit privacy_path },
    "shared_route" => -> { visit community_engine.shared_route_path(@shared) },
    "profile" => -> { sign_in; visit profile_path },
    "feed" => -> { sign_in; visit community_engine.feed_path },
    "lesson" => -> { sign_in; visit learning_routes_engine.route_step_path(@route, @step) },
    "journey" => -> { sign_in; visit learning_routes_engine.journey_route_path(@route) },
    "wizard" => -> { sign_in; visit new_route_wizard_path },
    "settings" => -> { sign_in; visit settings_path },
    "exam" => -> { sign_in; visit assessments.assessment_path(@assessment) },
    "notifications" => -> { sign_in; visit community_engine.notifications_path }
  }.freeze

  private

  def route_for(profile, topic, done:)
    route = LearningRoutesEngine::LearningRoute.create!(learning_profile: profile, topic: topic, locale: "es",
                                                        status: :active, current_step: done)
    preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: route.id, access_state: :preview)
    preview.update!(title: "Fundamentos")
    second = route.route_modules.create!(position: 2, title: "En el camino", access_state: :locked, generation_state: :ready)
    [[preview, M1, 0], [second, M2, 10]].each do |mod, titles, base|
      titles.each_with_index do |title, i|
        position = base + i
        status = position < done ? :completed : (position == done ? :available : :locked)
        route.route_steps.create!(route_module: mod, title: title, position: position, status: status,
                                  content_type: title.start_with?("Examen") ? :assessment : :lesson,
                                  level: :nv1, bloom_level: 1, estimated_minutes: 8)
      end
    end
    route
  end

  def sign_in
    return if @signed_in

    visit core.sign_in_path
    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    find("form[action='#{core.sign_in_path}'] [type='submit']").click
    assert_no_current_path core.sign_in_path, wait: 5
    @signed_in = true
  end

  def set_theme(theme)
    page.execute_script("document.documentElement.setAttribute('data-theme', arguments[0])", theme)
    sleep 0.6
  end

  def shoot(name, theme, width)
    dir = Rails.root.join("tmp/redesign/pr5b")
    FileUtils.mkdir_p(dir)
    data = page.driver.browser.execute_cdp("Page.captureScreenshot", format: "png", captureBeyondViewport: true,
                                           clip: { x: 0, y: 0, width: width, scale: 1,
                                                   height: [page.evaluate_script("document.documentElement.scrollHeight"), 5000].min })["data"]
    File.binwrite(dir.join("#{ENV.fetch('SCREENSHOT_PREFIX', '')}#{name}-#{theme}-#{width}.png"), Base64.decode64(data))
  end
end
