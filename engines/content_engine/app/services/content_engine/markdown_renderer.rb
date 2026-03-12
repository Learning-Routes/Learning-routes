module ContentEngine
  class MarkdownRenderer
    class RougeHTMLFormatter < Rouge::Formatters::HTML
      def initialize
        super(css_class: "highlight")
      end
    end

    # Languages that get a visual "Run" button (decorative — signals interactivity)
    RUNNABLE_LANGUAGES = %w[python ruby javascript js typescript ts bash shell sh].freeze

    class CodeRenderer < Redcarpet::Render::HTML
      def block_code(code, language)
        language = language.to_s.strip
        language = "text" if language.empty?

        lexer = Rouge::Lexer.find(language) || Rouge::Lexers::PlainText.new
        formatter = RougeHTMLFormatter.new
        highlighted = formatter.format(lexer.lex(code))

        copy_label = ERB::Util.html_escape(I18n.t("code_editor.copy"))
        copied_label = ERB::Util.html_escape(I18n.t("code_editor.copied"))
        lang_display = ERB::Util.html_escape(language)

        # Run button for supported languages (visual feedback only)
        run_btn = ""
        if MarkdownRenderer::RUNNABLE_LANGUAGES.include?(language.downcase)
          run_btn = <<~BTN
            <button class="code-block-run" data-action="click->copy-code#fakeRun" data-copy-code-target="runBtn">
              <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Run
            </button>
          BTN
        end

        <<~HTML
          <div class="code-block" data-controller="copy-code" data-copy-code-copied-text-value="#{copied_label}">
            <div class="code-block-header">
              <div class="code-block-dots"><span></span><span></span><span></span></div>
              <span class="code-block-lang">#{lang_display}</span>
              <div style="display:flex;align-items:center;gap:0.5rem;">
                #{run_btn}
                <button data-action="click->copy-code#copy" data-copy-code-target="button"
                        class="text-xs text-gray-500 hover:text-white transition" style="font-family:'DM Mono',monospace;font-size:0.6875rem;">#{copy_label}</button>
              </div>
            </div>
            <pre class="p-5 text-sm leading-relaxed overflow-x-auto" style="border-radius:0 0 11px 11px;margin-top:0;"><code data-copy-code-target="code">#{highlighted}</code></pre>
            <div class="code-block-output" data-copy-code-target="output"></div>
          </div>
        HTML
      end
    end

    INTERACTIVE_BLOCKS = {
      "concept" => { icon: "\u{1F4A1}", css: "lesson-block--concept" },
      "check"   => { icon: "\u{2753}", css: "lesson-block--check" },
      "tip"     => { icon: "\u{1F4DD}", css: "lesson-block--tip" },
      "example" => { icon: "\u{1F30D}", css: "lesson-block--example" },
      "summary" => { icon: "\u{2705}", css: "lesson-block--summary" }
    }.freeze

    def self.render(markdown_text)
      return "" if markdown_text.blank?

      # Pre-process interactive ::: blocks before markdown rendering
      processed = preprocess_blocks(markdown_text)

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
      html = markdown.render(processed)
      sanitized = Rails::HTML5::SafeListSanitizer.new.sanitize(
        html,
        tags: %w[p br h1 h2 h3 h4 h5 h6 strong em b i u s del a ul ol li dl dt dd
                 blockquote pre code div span table thead tbody tr th td
                 img hr sup sub kbd mark abbr details summary button input label
                 svg polygon path polyline circle rect line],
        attributes: %w[href src alt title class id target rel style type name value
                       checked disabled data-controller data-action
                       data-copy-code-target data-copy-code-copied-text-value
                       data-correct data-lesson-check-target
                       colspan rowspan viewBox fill points d stroke stroke-width
                       stroke-linecap stroke-linejoin width height]
      )
      sanitized.html_safe
    end

    # Transform :::type blocks into styled HTML divs before markdown parsing
    def self.preprocess_blocks(text)
      # Match :::type OPTIONAL_TITLE\n content \n:::
      text.gsub(/^:::(\w+)\s*(.*?)\n(.*?)^:::/m) do |_match|
        block_type = $1.downcase
        title = $2.strip
        body = $3.strip

        config = INTERACTIVE_BLOCKS[block_type]
        next _match unless config

        if block_type == "check"
          # The regex captures the question as "title" since it's on the line after :::check
          # Reconstruct full body: title (question) + remaining body (options)
          full_body = title.present? ? "#{title}\n#{body}" : body
          render_check_block(full_body)
        else
          render_content_block(block_type, title, body, config)
        end
      end
    end

    TITLED_BLOCKS = %w[concept].freeze

    def self.render_content_block(type, title, body, config)
      # For blocks that expect a title (concept), use the captured title.
      # For others (tip, example, summary), the "title" is actually body content.
      if TITLED_BLOCKS.include?(type)
        heading = title.present? ? title : type.capitalize
        full_body = body
      else
        heading = I18n.t("learning_engine.lesson.block_#{type}", default: type.capitalize)
        full_body = title.present? ? "#{title}\n#{body}" : body
      end

      <<~HTML
        <div class="lesson-block #{config[:css]}">
          <div class="lesson-block__header">
            <span class="lesson-block__icon">#{config[:icon]}</span>
            <span class="lesson-block__title">#{ERB::Util.html_escape(heading)}</span>
          </div>
          <div class="lesson-block__body">

        #{full_body}

          </div>
        </div>
      HTML
    end

    def self.render_check_block(body)
      lines = body.lines
      question = lines.shift&.strip || ""
      options = []

      lines.each do |line|
        line = line.strip
        if line.match?(/^-\s*\[[ x]\]/)
          correct = line.include?("[x]")
          label = line.sub(/^-\s*\[[ x]\]\s*/, "").strip
          options << { label: label, correct: correct }
        end
      end

      option_html = options.each_with_index.map do |opt, i|
        letter = ("A".ord + i).chr
        data_correct = opt[:correct] ? "true" : "false"
        <<~HTML
          <button class="lesson-check__option" data-action="click->lesson-check#select" data-correct="#{data_correct}" data-lesson-check-target="option">
            <span class="lesson-check__letter">#{letter}</span>
            <span>#{ERB::Util.html_escape(opt[:label])}</span>
          </button>
        HTML
      end.join

      <<~HTML
        <div class="lesson-block lesson-block--check" data-controller="lesson-check">
          <div class="lesson-block__header">
            <span class="lesson-block__icon">#{INTERACTIVE_BLOCKS["check"][:icon]}</span>
            <span class="lesson-block__title">#{I18n.t("learning_engine.lesson.check_title", default: "Quick Check")}</span>
          </div>
          <div class="lesson-block__body">
            <p class="lesson-check__question">#{ERB::Util.html_escape(question)}</p>
            <div class="lesson-check__options" data-lesson-check-target="options">
              #{option_html}
            </div>
            <div class="lesson-check__feedback" data-lesson-check-target="feedback" style="display:none;"></div>
          </div>
        </div>
      HTML
    end

    private_class_method :preprocess_blocks, :render_content_block, :render_check_block
  end
end
