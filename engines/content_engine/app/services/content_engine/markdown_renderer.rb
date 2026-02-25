module ContentEngine
  class MarkdownRenderer
    class RougeHTMLFormatter < Rouge::Formatters::HTML
      def initialize
        super(css_class: "highlight")
      end
    end

    class CodeRenderer < Redcarpet::Render::HTML
      def block_code(code, language)
        language = language.to_s.strip
        language = "text" if language.empty?

        lexer = Rouge::Lexer.find(language) || Rouge::Lexers::PlainText.new
        formatter = RougeHTMLFormatter.new
        highlighted = formatter.format(lexer.lex(code))

        copy_label = ERB::Util.html_escape(I18n.t("code_editor.copy"))
        copied_label = ERB::Util.html_escape(I18n.t("code_editor.copied"))

        <<~HTML
          <div class="code-block" data-controller="copy-code" data-copy-code-copied-text-value="#{copied_label}">
            <div class="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
              <span class="text-xs text-gray-500 font-mono">#{ERB::Util.html_escape(language)}</span>
              <button data-action="click->copy-code#copy" data-copy-code-target="button"
                      class="text-xs text-gray-500 hover:text-white transition">#{copy_label}</button>
            </div>
            <pre class="p-5 text-sm leading-relaxed overflow-x-auto"><code data-copy-code-target="code">#{highlighted}</code></pre>
          </div>
        HTML
      end
    end

    def self.render(markdown_text)
      return "" if markdown_text.blank?

      renderer = CodeRenderer.new(
        hard_wrap: true,
        link_attributes: { target: "_blank", rel: "noopener noreferrer" }
      )
      markdown = Redcarpet::Markdown.new(renderer,
        fenced_code_blocks: true,
        tables: true,
        autolink: true,
        strikethrough: true,
        superscript: true,
        highlight: true,
        footnotes: true
      )
      html = markdown.render(markdown_text)
      sanitized = Rails::HTML5::SafeListSanitizer.new.sanitize(
        html,
        tags: %w[p br h1 h2 h3 h4 h5 h6 strong em b i u s del a ul ol li dl dt dd
                 blockquote pre code div span table thead tbody tr th td
                 img hr sup sub kbd mark abbr details summary],
        attributes: %w[href src alt title class style id target rel
                       data-controller data-action data-copy-code-target
                       data-copy-code-copied-text-value
                       colspan rowspan]
      )
      sanitized.html_safe
    end
  end
end
