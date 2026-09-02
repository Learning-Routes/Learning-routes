require "application_system_test_case"

class OwnerDashboardTest < ApplicationSystemTestCase
  setup do
    Core::User.where(role: :owner).update_all(role: Core::User.roles[:student])
    @owner = create_test_user(name: "Browser Owner", role: :owner, email_verified_at: Time.current)
    @student = create_test_user(name: "Browser Needle", email: "browser-needle@example.test")
    profile = LearningRoutesEngine::LearningProfile.create!(user: @student)
    @route = profile.learning_routes.create!(topic: "Browser Route", status: :active, generation_status: "completed")
    @route.route_steps.create!(title: "Browser Step", position: 0, status: :completed)
    @paid_module = @route.route_modules.create!(position: 2, title: "Browser Locked Module", access_state: :locked)
    26.times { |index| create_test_user(name: "Browser Page #{index}") }
    sign_in_through_ui
  end

  test "owner navigates searches paginates and opens user drill-down" do
    visit admin_root_path
    assert_text I18n.t("admin.dashboard.title")
    click_link I18n.t("admin.dashboard.view_users")
    within("form.admin-toolbar") do
      fill_in I18n.t("admin.users.search"), with: "browser-needle"
      click_button I18n.t("admin.users.apply")
    end
    assert_current_path %r{\A/admin/users\?.*search=browser-needle}, ignore_query: false, wait: 5
    assert_text @student.email
    student_path = admin_user_path(@student)
    assert_link @student.name, href: student_path

    # Dispatch via the DOM rather than a physical WebDriver click: a real click
    # is coordinate-based and this row sits right under the search toolbar, so
    # it's the same class of flake the pagination click below was already
    # written to avoid. Then assert on rendered CONTENT first — Capybara's text
    # matchers wait on the DOM, whereas assert_current_path polls the driver's
    # URL and can start (or, under load, even finish) before Turbo has actually
    # swapped the body. The path assertion then confirms the URL settled.
    page.execute_script("arguments[0].click()", find("a[href='#{student_path}']"))
    assert_selector "h1", text: @student.name, wait: 10
    assert_current_path student_path, wait: 10
    assert_text "Browser Route"
    visit admin_route_path(@route)
    assert_text "Browser Locked Module"
    assert_text I18n.t("admin.module_access.locked")

    visit admin_users_path
    next_page = admin_users_path(page: 2)
    assert_link I18n.t("admin.pagination.next"), href: next_page
    page.execute_script("arguments[0].click()", find("a[href='#{next_page}']"))
    assert_text(/Page 2 of 2/, wait: 10)
    assert_current_path admin_users_path(page: 2), ignore_query: false, wait: 10
  end

  test "dashboard is responsive and resolves both persisted themes" do
    %w[light dark].each do |theme|
      @owner.update!(theme: theme)
      visit admin_root_path
      assert_equal theme, page.evaluate_script("document.documentElement.dataset.theme")
    end

    page.driver.browser.execute_cdp("Emulation.setDeviceMetricsOverride",
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true)
    visit admin_root_path
    width = page.evaluate_script("document.documentElement.scrollWidth")
    viewport_width = page.evaluate_script("window.innerWidth")
    offenders = page.evaluate_script(<<~JS)
      [...document.querySelectorAll("body *")]
        .filter((element) => element.getBoundingClientRect().right > window.innerWidth)
        .slice(0, 5)
        .map((element) => `${element.tagName}.${element.className}:${Math.round(element.getBoundingClientRect().right)}`)
    JS
    assert_operator width, :<=, viewport_width, "overflowing elements: #{offenders.join(', ')}"
  ensure
    page.driver.browser.execute_cdp("Emulation.clearDeviceMetricsOverride")
  end

  test "a non-owner browser session receives a hard forbidden page without owner data" do
    if page.has_button?(I18n.t("nav.sign_out"), wait: 0)
      click_button I18n.t("nav.sign_out")
      # The sign-out button is a plain Turbo-driven button_to (no data-turbo="false"),
      # so the click above returns before the DELETE request lands and the session
      # cookie is cleared. Visiting sign_in_path immediately can race that: if the
      # server still sees a signed-in user, GET /sign_in redirects to the dashboard
      # instead of rendering the form, and the next fill_in fails oddly downstream.
      # Wait for the button to disappear (proof the sign-out response was received
      # and rendered) before treating the session as clear.
      assert_no_button I18n.t("nav.sign_out"), wait: 10
    end
    visit core.sign_in_path
    fill_in "email", with: @student.email
    fill_in "password", with: "password123"
    find("input[type='submit']").click
    assert_current_path core.verify_pending_path, wait: 5

    visit admin_root_path

    assert_text(/Forbidden|Prohibido/)
    assert_no_text "Browser Owner"
  end

  private

  def sign_in_through_ui
    visit core.sign_in_path
    fill_in "email", with: @owner.email
    fill_in "password", with: "password123"
    assert_field "email", with: @owner.email
    assert_field "password", with: "password123"
    find("input[type='submit']").click
    assert_current_path main_app.profile_path, wait: 5
  end
end
