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

        <<~HTML
          <div class="code-block" data-controller="copy-code">
            <div class="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
              <span class="text-xs text-gray-500 font-mono">#{ERB::Util.html_escape(language)}</span>
              <button data-action="click->copy-code#copy" data-copy-code-target="button"
                      class="text-xs text-gray-500 hover:text-white transition">Copy</button>
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
      markdown.render(markdown_text).html_safe
    end
  end
end
