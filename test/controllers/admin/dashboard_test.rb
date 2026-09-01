require "test_helper"

class AdminDashboardTest < ActionDispatch::IntegrationTest
  setup do
    Core::User.where(role: :owner).update_all(role: Core::User.roles[:student])
    @owner = create_test_user(role: :owner, email_verified_at: Time.current)
    @student = create_test_user(name: "Dashboard Student", email: "dashboard-student@example.test")
    profile = LearningRoutesEngine::LearningProfile.create!(user: @student)
    profile.learning_routes.create!(topic: "Real Learning Route", status: :active)
    AiOrchestrator::AiInteraction.create!(user: @student, model: "gpt-5.2", prompt: "DO NOT LEAK PROMPT",
      response: "DO NOT LEAK RESPONSE", status: :completed, pricing_status: "priced", cost_microcents: 12_345)
    AiOrchestrator::AiInteraction.create!(user: @student, model: "tavily", prompt: "DO NOT LEAK UNPRICED",
      status: :completed, pricing_status: "unpriced")
    sign_in_as(@owner)
  end

  test "renders honest summary and user navigation without commerce fiction or secrets" do
    get admin_root_path

    assert_response :success
    assert_select "h1", text: I18n.t("admin.dashboard.title")
    assert_select "[data-metric='registered-users']", text: Core::User.count.to_s
    assert_select "[data-metric='routes']", text: LearningRoutesEngine::LearningRoute.count.to_s
    assert_select "[data-metric='ai-cost']", text: /0\.0123/
    assert_select "[data-cost-status]", text: /Pricing incomplete/
    assert_select "a[href='#{admin_users_path}']"
    assert_no_match(/purchase|revenue|profit|fee|quote|payment/i, response.body)
    assert_no_match(/DO NOT LEAK|password_digest|remember_token/i, response.body)
  end

  test "renders complete Spanish copy for a Spanish owner" do
    @owner.update!(locale: "es")

    get admin_root_path

    assert_select "h1", text: I18n.t("admin.dashboard.title", locale: :es)
    assert_no_match(/Registered users|Owner dashboard/, response.body)
  end
end
