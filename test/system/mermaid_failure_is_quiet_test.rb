require "application_system_test_case"

# WP-35 §7. The owner's screenshot has two blocks at the BOTTOM of a step page,
# below the comments, reading "Syntax error in text / mermaid version 11.16.0".
#
# Mermaid 11 renders its own error graphic into document.body when a diagram
# will not parse, unless `initialize()` sets `suppressErrorRendering: true`.
# This controller already had a fallback of its own, so BOTH appeared: one in
# place and one orphaned at the end of the page, with nothing to say which
# diagram it belonged to.
#
# A student who cannot see a diagram should read one localized sentence where
# the diagram was, and nothing anywhere else.
class MermaidFailureIsQuietTest < ApplicationSystemTestCase
  BROKEN = <<~MERMAID.freeze
    flowchart TD
      A[[[--> B{{{
      ]]] --( C
  MERMAID

  def setup
    @user = Core::User.create!(
      name: "Mermaid", email: "mermaid-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, locale: "es"
    )
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Portugués", locale: "es", status: :active
    )
    preview = LearningRoutesEngine::RouteModule.find_by!(
      learning_route_id: @route.id, access_state: :preview
    )
    @step = @route.route_steps.create!(
      route_module: preview, title: "Diagrama roto", position: 0, status: :in_progress,
      content_type: :lesson, level: :nv1, bloom_level: 1,
      metadata: {
        "parsed_sections" => [
          { "type" => "visual", "title" => "Diagrama", "body" => "Mira esto.", "mermaid" => BROKEN }
        ],
        "content_ready" => true
      }
    )
    ContentEngine::AiContent.create!(route_step: @step, content_type: :text, body: "## Concepto: x\nb")
  end

  test "an unparseable diagram leaves no error graphic anywhere on the page" do
    open_step

    assert_no_match(/Syntax error in text/i, page.text,
      "Mermaid's own error graphic reached the page: initialize() must set " \
      "suppressErrorRendering")
    assert_no_match(/mermaid version/i, page.text)
  end

  test "no svg is orphaned outside the diagram container" do
    open_step

    orphans = page.evaluate_script(<<~JS)
      [...document.querySelectorAll("svg")].filter((el) => !el.closest(".mermaid-container")).length
    JS

    # The page's own chrome has icons; what must not appear is Mermaid's, which
    # it appends directly to <body>.
    body_level = page.evaluate_script(<<~JS)
      [...document.body.children].filter((el) => el.tagName === "SVG" || el.id?.startsWith("d")).length
    JS

    assert_equal 0, body_level,
      "an SVG was appended straight to <body> — that is Mermaid's orphan error graphic"
    assert_operator orphans, :>=, 0
  end

  test "the container shows a localized fallback with the source collapsed" do
    open_step

    within ".mermaid-container" do
      assert_text I18n.t("learning_engine.lesson.diagram_unavailable", locale: :es)
      assert_selector "details", visible: :all
    end

    refute_match(/#{Regexp.escape(I18n.t("learning_engine.lesson.diagram_unavailable", locale: :en))}/,
      page.text, "the Spanish student read the English string")
  end

  # The raw diagram must not be dumped on the page; it lives behind the
  # disclosure.
  test "the mermaid source is not visible until asked for" do
    open_step

    state = page.evaluate_script(<<~JS)
      (() => {
        const details = document.querySelector(".mermaid-container details")
        const pre = document.querySelector(".mermaid-container pre")
        return {
          hasDetails: !!details,
          open: details ? details.hasAttribute("open") : null,
          preHeight: pre ? pre.getBoundingClientRect().height : 0
        }
      })()
    JS

    assert state["hasDetails"], "the source must live behind a disclosure"
    assert_equal false, state["open"], "the disclosure must start closed"
    assert_equal 0, state["preHeight"],
      "the raw Mermaid source was on screen without being asked for"
  end

  # THE OTHER PATH. `_visual.html.erb` is not the only way a diagram reaches a
  # student: a fenced ```mermaid block inside a concept body renders through
  # MarkdownRenderer, which mounted the controller with no fallback labels — and
  # whose sanitizer would have stripped them anyway. The student got an icon with
  # an empty sentence and no disclosure.
  #
  # Note the fixture: NO `mermaid` key in parsed_sections. The diagram is in the
  # markdown, which is the case `_visual.html.erb` never sees.
  test "a broken diagram inside a concept body falls back with a localized sentence" do
    body = "Mira esto.\n\n```mermaid\n#{BROKEN}```\n\nY esto."
    @step.update!(metadata: {
      "parsed_sections" => [{ "type" => "concept", "title" => "Concepto", "body" => body }],
      "content_ready" => true
    })
    ContentEngine::AiContent.where(route_step: @step).update_all(body: "## Concepto: x\n#{body}")

    open_step

    within ".mermaid-container" do
      assert_text I18n.t("learning_engine.lesson.diagram_unavailable", locale: :es)
      assert_selector "details", visible: :all
    end
    assert_no_match(/Syntax error in text/i, page.text)
  end

  private

  def open_step
    visit core.sign_in_path
    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    assert_field "email", with: @user.email
    find("input[type='submit']").click
    assert_no_current_path core.sign_in_path, wait: 5

    visit learning_routes_engine.route_step_path(@route, @step)
    assert_selector ".mermaid-container", wait: 10
    # Give the controller time to try, fail, and fall back.
    assert_selector ".mermaid-container .mermaid-fallback", wait: 10
  end
end
