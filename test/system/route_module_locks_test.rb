require "application_system_test_case"

class RouteModuleLocksTest < ApplicationSystemTestCase
  setup do
    @user = create_test_user(email_verified_at: Time.current)
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user)
    @route = profile.learning_routes.create!(topic: "Browser Modules", status: :active)
    preview = @route.route_modules.find_by!(access_state: :preview)
    @preview_step = @route.route_steps.create!(route_module: preview, position: 1,
      title: "Free Browser Lesson", status: :available, content_type: :review)
    paid = @route.route_modules.create!(position: 2, title: "Visible Locked Outline",
      description: "Outline only", access_state: :locked, generation_state: :outlined)
    @paid_step = @route.route_steps.create!(route_module: paid, position: 2,
      title: "Hidden paid step", status: :available, metadata: { "answer_key" => "BROWSER SECRET" })
    sign_in
  end

  test "student sees one free module and visible locked outline but cannot open paid step" do
    visit learning_routes_engine.route_path(@route)

    assert_selector "[data-module-access='preview']", count: 1
    assert_selector "[data-module-access='locked']", count: 1
    assert_text "Free Browser Lesson"
    assert_text "Visible Locked Outline"
    assert_no_text "Hidden paid step"
    assert_no_text "BROWSER SECRET"

    visit learning_routes_engine.route_step_path(@route, @paid_step)
    assert_text(/403|Forbidden|Prohibido|denied/)
  end

  private

  def sign_in
    visit core.sign_in_path
    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    click_button I18n.t("auth.login.submit")
    assert_no_current_path core.sign_in_path
  end
end
