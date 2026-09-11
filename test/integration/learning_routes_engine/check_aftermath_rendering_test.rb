require "test_helper"

# WP-33 §2, the half a student sees.
#
# A `check` renders no block in the flow — its modal is emitted after the
# sections container, because the controller overlays it on the content the
# student is reading rather than transitioning to it. So the `.lesson-section`
# element for a check is EMPTY, and that is where its aftermath belongs: the
# student answers the modal, it closes, and the diagram the author put after the
# question is there in the lesson.
#
# Never inside the modal. A modal is a question, not a page, and the controller
# closes it.
module LearningRoutesEngine
  class CheckAftermathRenderingTest < ActionDispatch::IntegrationTest
    BODY = <<~MARKDOWN.freeze
      ## Concepto: Warm up
      Some prose.

      ## Pregunta: What does this print?

      ```python
      print(2 + 2)
      ```
      A) 4
      B) 22
      C) An error
      D) Nothing
      CORRECTA: A
      EXPLICACIÓN: Addition happens first.

      ```mermaid
      flowchart TD
        A[Start] --> B[Finish]
      ```

      Trailing prose the author wrote after the question.
    MARKDOWN

    def setup
      @user = create_test_user(email_verified_at: Time.current, locale: "es")
      profile = LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoute.create!(
        learning_profile: profile, topic: "Portugués", locale: "es", status: :active
      )
      preview = RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
      sections = ContentEngine::LessonSectionParser.call(BODY).map(&:as_json)
      @step = @route.route_steps.create!(
        route_module: preview, title: "Lección", position: 0, status: :in_progress,
        content_type: :lesson, level: :nv1, bloom_level: 1,
        metadata: { "parsed_sections" => sections, "content_ready" => true }
      )
      ContentEngine::AiContent.create!(route_step: @step, content_type: :text, body: BODY)
      post core.sign_in_path, params: { email: @user.email, password: "password123" }
    end

    def check_index
      @step.metadata["parsed_sections"].index { |s| s["type"] == "check" }
    end

    test "the aftermath renders inside the check's own section, not in the modal" do
      get learning_routes_engine.route_step_path(@route, @step)

      assert_response :success
      doc = Nokogiri::HTML(response.body)

      section = doc.at_css(".lesson-section[data-section-index='#{check_index}']")
      assert section, "the check's section element is missing"
      assert_includes section.to_html, "Trailing prose the author wrote after the question.",
        "the aftermath is not in the check's section; the parser used to delete it entirely"
      assert section.at_css(".mermaid-container"),
        "the diagram the generator is told to emit after the question is not rendered"

      modal = doc.at_css(".quiz-modal-backdrop[data-section-index='#{check_index}']")
      assert modal, "the check modal is missing"
      assert_not_includes modal.to_html, "Trailing prose the author wrote after the question.",
        "the aftermath was rendered inside the modal, which closes"
    end

    # The controller cannot see the aftermath from JavaScript without reading
    # the DOM for content, so the server says whether there is something to
    # show: `data-has-aftermath` decides whether the lesson lands on the check's
    # section after the modal or skips past it, as it always did.
    test "the check's section says whether it has an aftermath to show" do
      get learning_routes_engine.route_step_path(@route, @step)

      doc = Nokogiri::HTML(response.body)
      section = doc.at_css(".lesson-section[data-section-index='#{check_index}']")
      assert_equal "true", section["data-has-aftermath"],
        "the controller has no way to know it should land on this section"

      bare = @step.metadata["parsed_sections"].map { |s| s["type"] == "check" ? s.except("aftermath") : s }
      @step.update!(metadata: @step.metadata.merge("parsed_sections" => bare))
      get learning_routes_engine.route_step_path(@route, @step)

      doc = Nokogiri::HTML(response.body)
      section = doc.at_css(".lesson-section[data-section-index='#{check_index}']")
      assert_equal "false", section["data-has-aftermath"],
        "a check with nothing after it must still be skipped"
    end

    # The question of a programming check is a code fence. Printed as plain text
    # the student read backticks.
    test "the question reaches the modal as sanitized HTML, not as backticks" do
      get learning_routes_engine.route_step_path(@route, @step)

      modal = Nokogiri::HTML(response.body)
        .at_css(".quiz-modal-backdrop[data-section-index='#{check_index}']")

      assert modal.at_css("code"), "the code sample rendered as text; the student saw backticks"
      assert_includes modal.text, "print(2 + 2)"
      assert_not_includes modal.text, "```python", "the fence markers reached the student"
    end

    test "the question markdown is sanitized on the way through" do
      html = ContentEngine::MarkdownRenderer.render("What is `x`?<script>alert(1)</script>")

      assert_includes html, "<code>x</code>"
      assert_not_includes html, "<script>"
    end

    # AN OPTION-LESS `## Pregunta` IS THE OTHER WAY INTO THE MODAL.
    #
    # With no `A)`-`D)` line the parser had no `first_option_index`, so the whole
    # body — the mermaid fence included — became the `question`. The question is
    # now rendered through MarkdownRenderer, so the diagram drew inside the
    # modal: the one place this file exists to keep it out of.
    test "an option-less check keeps its diagram out of the modal" do
      body = <<~MARKDOWN
        ## Pregunta: What do you observe?
        Think about it for a moment before you go on.

        ```mermaid
        graph TD
          A[Start] --> B[Finish]
        ```
      MARKDOWN
      sections = ContentEngine::LessonSectionParser.call(body).map(&:as_json)
      step = @route.route_steps.create!(
        route_module: @step.route_module, title: "Sin opciones", position: 1,
        status: :in_progress, content_type: :lesson, level: :nv1, bloom_level: 1,
        metadata: { "parsed_sections" => sections, "content_ready" => true }
      )
      ContentEngine::AiContent.create!(route_step: step, content_type: :text, body: body)
      index = sections.index { |s| s["type"] == "check" }

      get learning_routes_engine.route_step_path(@route, step)

      assert_response :success
      doc = Nokogiri::HTML(response.body)

      modal = doc.at_css(".quiz-modal-backdrop[data-section-index='#{index}']")
      assert modal, "the check modal is missing"
      assert_nil modal.at_css(".mermaid-container"),
        "the diagram was folded into `question` and now draws inside the modal, " \
        "which the controller closes"

      section = doc.at_css(".lesson-section[data-section-index='#{index}']")
      assert section.at_css(".mermaid-container"),
        "the diagram belongs in the check's own section, in the lesson flow"
    end

    # The rule that governs everything in this package.
    test "adding fields does not change how many sections the body produces" do
      sections = ContentEngine::LessonSectionParser.call(BODY)

      assert_equal %w[concept check summary], sections.map { |s| s[:type] },
        "the section count or order changed; every recorded block_attempt would " \
        "now point at a different block"
    end
  end
end
