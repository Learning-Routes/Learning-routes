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
    fill_in I18n.t("admin.users.search"), with: "browser-needle"
    click_button I18n.t("admin.users.apply")
    assert_text @student.email
    click_link @student.name
    assert_text "Browser Route"
    visit admin_route_path(@route)
    assert_text "Browser Locked Module"
    assert_text I18n.t("admin.module_access.locked")

    visit admin_users_path
    assert_link I18n.t("admin.pagination.next")
    click_link I18n.t("admin.pagination.next")
    assert_text(/Page 2 of 2/)
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
    click_button I18n.t("nav.sign_out") if page.has_button?(I18n.t("nav.sign_out"), wait: 0)
    visit core.sign_in_path
    fill_in "email", with: @student.email
    fill_in "password", with: "password123"
    find("input[type='submit']").click

    visit admin_root_path

    assert_text(/Forbidden|Prohibido/)
    assert_no_text "Browser Owner"
  end

  private

  def sign_in_through_ui
    visit core.sign_in_path
    fill_in "email", with: @owner.email
    fill_in "password", with: "password123"
    find("input[type='submit']").click
    assert_no_current_path core.sign_in_path
  end
end
