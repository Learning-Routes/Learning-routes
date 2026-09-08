require "test_helper"

# WP-35 §7, second half. `_visual.html.erb` is not the only way a diagram reaches
# a student.
#
# `MarkdownRenderer` mounts `data-controller="mermaid-diagram"` for a fenced
# ```mermaid block and passed NO fallback labels — and its own sanitizer
# allow-list would have stripped them anyway, since it lists
# `data-mermaid-diagram-target` and neither `-fallback-label-value` nor
# `-source-label-value`.
#
# So a diagram inside a concept body — or inside the WP-24 §2 aftermath, which
# renders through this same path — failed to an icon with an EMPTY sentence and
# no disclosure: `this.fallbackLabelValue` is "" and the controller renders the
# header with nothing in it.
#
# The attributes are asserted AFTER sanitization, because passing the sanitizer
# is the whole difficulty: emitting them and having them stripped looks identical
# in the source and is identical on screen.
module ContentEngine
  class MarkdownMermaidFallbackTest < ActiveSupport::TestCase
    BODY = "Intro.\n\n```mermaid\nflowchart TD\n  A-->B\n```\n\nOutro."

    %i[en es].freeze.each do |locale|
      test "a fenced mermaid block carries both fallback labels in #{locale}" do
        html = I18n.with_locale(locale) { MarkdownRenderer.render(BODY) }
        node = Nokogiri::HTML.fragment(html).at_css("[data-controller~='mermaid-diagram']")

        assert node, "the mermaid container did not survive rendering"
        assert_equal I18n.t("learning_engine.lesson.diagram_unavailable", locale: locale),
          node["data-mermaid-diagram-fallback-label-value"],
          "the fallback sentence was empty or the sanitizer stripped it"
        assert_equal I18n.t("learning_engine.lesson.diagram_source", locale: locale),
          node["data-mermaid-diagram-source-label-value"],
          "the disclosure label was empty or the sanitizer stripped it"
      end
    end

    # The sanitizer is the half that is easy to forget: the renderer can emit a
    # perfectly good attribute and have it removed on the way out.
    test "the sanitizer allows both value attributes through" do
      html = MarkdownRenderer.render(BODY)

      assert_match "data-mermaid-diagram-fallback-label-value", html
      assert_match "data-mermaid-diagram-source-label-value", html
    end

    test "the diagram target and the code both survive" do
      html = MarkdownRenderer.render(BODY)
      node = Nokogiri::HTML.fragment(html).at_css("[data-mermaid-diagram-target='chart']")

      assert node, "the chart target was stripped"
      assert_match "flowchart TD", node.text
    end

    # Nothing else should have gained an opening: the allow-list is a security
    # boundary (audit §4.7) and this change widens it by exactly two names.
    test "the allow-list gains only the two value attributes" do
      source = File.read(Rails.root.join(
        "engines/content_engine/app/services/content_engine/markdown_renderer.rb"
      ))
      allowed = source[/attributes: %w\[(.*?)\]/m, 1].to_s.split

      assert_includes allowed, "data-mermaid-diagram-fallback-label-value"
      assert_includes allowed, "data-mermaid-diagram-source-label-value"
      assert_not_includes allowed, "onclick"
      assert_not_includes allowed, "srcdoc"
    end
  end
end
