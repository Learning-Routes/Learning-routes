require "test_helper"

# WP-24 §2. The consequence reached the student as raw text with `&quot;` in it.
#
# `_scenario.html.erb` shipped it through an HTML attribute built like this:
#
#   data-consequence="<%= option[:consequence]&.gsub('"', '&quot;') %>"
#
# `<%= %>` escapes what it is given, so the `&` of `&quot;` became `&amp;quot;`,
# the browser decoded the attribute back, and every consequence containing a
# double quote showed the six literal characters `&quot;`. The controller then
# did `consequenceTextTarget.textContent = consequence`, so `**emphasis**`
# printed as asterisks and every newline was gone.
class LearningRoutesEngine::ScenarioRenderingTest < ActionDispatch::IntegrationTest
  CONSEQUENCE = <<~MARKDOWN.strip
    She says **"thank you"** and stays with you.

    You keep the account for another year.
  MARKDOWN

  AFTERMATH = <<~MARKDOWN.strip
    ### What actually happened

    ```mermaid
    sequenceDiagram
        Alice->>John: Hello John
    ```
  MARKDOWN

  SECTIONS = [
    {
      "type" => "scenario",
      "title" => "Una queja",
      "situation" => "Un cliente se queja del servicio.",
      "options" => [
        { "label" => "Pedir disculpas", "consequence" => CONSEQUENCE },
        { "label" => "Ignorarla",       "consequence" => "Se marcha y no vuelve." }
      ],
      "aftermath" => AFTERMATH
    }
  ].freeze

  def setup
    @user = Core::User.create!(
      name: "Esc", email: "esc-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Atención al cliente", locale: "es", status: :active
    )
    @step = @route.route_steps.create!(
      title: "Quejas", position: 0, status: :available, content_type: "lesson",
      delivery_format: "text", level: 1, bloom_level: 1,
      metadata: { "parsed_sections" => SECTIONS.map(&:deep_dup), "content_ready" => true }
    )
    ContentEngine::AiContent.create!(
      route_step: @step, content_type: :text, body: "## Escenario: Una queja\nbody"
    )
    post "/sign_in", params: { email: @user.email, password: "password123" }
  end

  def teardown
    I18n.locale = I18n.default_locale
    super
  end

  test "the consequence keeps its double quotes and shows no &quot; to the student" do
    body = page_html

    assert_includes body, "thank you", "the consequence never rendered at all"
    assert_not_includes body, "&amp;quot;",
      "the double escape that put the six literal characters `&quot;` on screen"
    assert_includes body, '"thank you"',
      "the quote must reach the page as a quote character, not as an entity to display"
  end

  test "markdown emphasis renders as emphasis instead of printing asterisks" do
    doc = page

    consequence = doc.css("[data-scenario-target='consequenceFor']").first
    assert consequence, "no server-rendered consequence element"
    assert consequence.css("strong").any?,
      "`**\"thank you\"**` printed its asterisks: the text was assigned with textContent"
    assert_equal 2, consequence.css("p").size,
      "the blank line between paragraphs was lost, which is what flattened the diagram too"
  end

  test "each option gets its own consequence, addressed by index" do
    doc = page
    rendered = doc.css("[data-scenario-target='consequenceFor']")

    assert_equal 2, rendered.size, "one hidden consequence per option"
    assert_equal %w[0 1], rendered.map { |el| el["data-option-index"] }
    assert_includes rendered[1].text, "Se marcha"
  end

  # The attribute is how the text got mangled. It must not come back.
  test "no consequence travels in a data attribute any more" do
    doc = page

    assert_empty doc.css("[data-consequence]"),
      "the consequence is going through an HTML attribute again"
    assert_empty doc.css("[data-scenario-target='consequenceText']"),
      "consequenceText is the target the controller assigned with textContent"
  end

  # §1: the aftermath is real lesson content that used to be swallowed by the
  # last option's consequence, flattened onto one line so it could never draw.
  test "the aftermath renders below the card, with its diagram intact" do
    doc = page

    assert_includes doc.text, "What actually happened"
    assert doc.css(".mermaid, [data-mermaid], pre code.language-mermaid").any? ||
           page_html.include?("mermaid"),
      "the mermaid container did not survive the renderer"
  end

  # A scenario has no correct option: it is in GATING_TYPES, not GRADABLE_TYPES,
  # and the parser produces no `correct` flag. "Result:" implied a verdict and
  # "Try Again" implied a right answer to reach — and both were hardcoded English
  # inside a Spanish UI.
  test "the scenario speaks the interface language and promises no verdict" do
    body = page_html

    # Asserted against the KEYS, in whatever locale the request rendered in, so
    # this test cannot be satisfied by hardcoding a string back into the partial.
    assert_includes body, I18n.t("learning_engine.blocks.scenario_consequence")
    assert_includes body, I18n.t("learning_engine.blocks.scenario_explore_another")
    assert_not_includes body, "Result:"
    assert_not_includes body, "Try Again"
  end

  test "both locales have the scenario vocabulary" do
    %i[es en].each do |locale|
      %w[scenario_consequence scenario_explore_another].each do |key|
        value = I18n.t("learning_engine.blocks.#{key}", locale: locale, default: nil)
        assert value.present?, "learning_engine.blocks.#{key} is missing in #{locale}"
      end
    end
  end

  private

  def page_html
    get learning_routes_engine.route_step_path(@route, @step)
    assert_response :success
    response.body
  end

  def page
    Nokogiri::HTML(page_html)
  end
end
