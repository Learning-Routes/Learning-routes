require "application_system_test_case"

# STEP 37 §7 (audit finding 8). `solid_cable` went 3 -> 4 with nothing exercising
# it: `config/cable.yml` gives the test environment `adapter: test`, so every
# Turbo Stream test in the suite runs on an in-process adapter production never
# uses. This test swaps the real adapter in for itself only — solid_cable against
# the test cable database — and proves the tutor's reply travels
# job -> solid_cable_messages -> listener -> WebSocket -> page, without a reload.
class TutorReplyOverSolidCableTest < ApplicationSystemTestCase
  REPLY = "Se dice *olá*, por cable."

  # A completed interaction, without reaching a model (same stand-in as
  # TutorReplyJobTest).
  Interaction = Class.new do
    attr_reader :response, :id

    def initialize(response) = (@response = response; @id = SecureRandom.uuid)
    def completed? = true
  end

  def setup
    use_solid_cable!

    @user = create_test_user(email_verified_at: Time.current, locale: "es")
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Portugués", locale: "es", status: :active
    )
    preview = LearningRoutesEngine::RouteModule.find_by!(
      learning_route_id: @route.id, access_state: :preview
    )
    @step = @route.route_steps.create!(
      route_module: preview, title: "Saludos", position: 0, status: :available,
      content_type: :lesson, delivery_format: "text", level: :nv1, bloom_level: 1,
      metadata: { "parsed_sections" => [{ "type" => "concept", "title" => "A", "body" => "b" }],
                  "content_ready" => true }
    )
    ContentEngine::AiContent.create!(route_step: @step, content_type: :text, body: "## Concepto: x\nbody")

    sign_in_through_ui
    visit learning_routes_engine.route_step_path(@route, @step)
  end

  def teardown
    super
  ensure
    restore_cable!
    I18n.locale = I18n.default_locale
  end

  test "the tutor's reply reaches the open page over solid_cable" do
    # Turbo marks the source `connected` once the subscription is confirmed; a
    # broadcast before that would be missed by design, not by a defect.
    assert_selector "turbo-cable-stream-source[connected]", visible: :all, wait: 10
    assert_kind_of ActionCable::SubscriptionAdapter::SolidCable, ActionCable.server.pubsub

    find("[data-tutor-chat-target='fab']").click
    question = LearningRoutesEngine::TutorMessage.create!(
      user: @user, step: @step, role: "user", content: "¿Cómo se dice hola?"
    )

    with_orchestrate(->(**) { Interaction.new(REPLY) }) do
      LearningRoutesEngine::TutorReplyJob.perform_now(question.id)
    end

    within("#tutor-messages-#{@step.id}") do
      assert_text "Se dice olá, por cable.", wait: 10
    end
    assert SolidCable::Message.exists?, "the reply must have gone through solid_cable_messages"
  end

  private

  # The adapter is chosen per process from `config/cable.yml`, so this test
  # points the running server at solid_cable and puts the test adapter back after.
  # The cable pool is established here, after fixtures began, so Rails wraps it in
  # the test transaction too: the rows roll back with everything else.
  def use_solid_cable!
    @previous_cable = ActionCable.server.config.cable
    ActionCable.server.restart
    SolidCable.configure(polling_interval: "0.05.seconds", autotrim: false)
    SolidCable::Record.connects_to(database: { writing: :cable })
    ActionCable.server.config.cable = { "adapter" => "solid_cable" }
  end

  def restore_cable!
    return unless @previous_cable

    ActionCable.server.restart
    ActionCable.server.config.cable = @previous_cable
    SolidCable::Record.remove_connection
    SolidCable.reset_configuration!
  end

  # `minitest/mock` is unavailable in this suite; swap the singleton and restore.
  def with_orchestrate(replacement)
    original = AiOrchestrator::Orchestrate.method(:call)
    AiOrchestrator::Orchestrate.define_singleton_method(:call, replacement)
    yield
  ensure
    AiOrchestrator::Orchestrate.define_singleton_method(:call, original)
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
