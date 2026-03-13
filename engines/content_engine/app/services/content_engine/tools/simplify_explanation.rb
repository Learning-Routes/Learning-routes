# frozen_string_literal: true

module ContentEngine
  module Tools
    class SimplifyExplanation < RubyLLM::Tool
      description "Simplifies complex content into an easier explanation. " \
                  "Use this when the user says they do not understand, asks for a simpler explanation, " \
                  "or requests an ELI5 (explain like I am 5) version."

      param :content, desc: "The content to simplify"
      param :level, desc: "Simplification level: basic, eli5, analogy", required: false

      def execute(content:, level: "basic")
        locale = Thread.current[:lesson_agent_locale] || "en"
        chat = RubyLLM.chat(model: "gpt-4.1-mini")

        style_instruction = case level
        when "eli5"
          "Explain this as if the reader is 5 years old. Use very simple words, fun analogies, and short sentences."
        when "analogy"
          "Re-explain this using a real-world analogy that makes the concept intuitive and memorable."
        else
          "Simplify this to a beginner-friendly level. Remove jargon, use shorter sentences, add examples."
        end

        prompt = <<~PROMPT
          #{style_instruction}

          Content to simplify:
          #{content}

          Write in #{locale} language. Use **bold** for key terms. Keep it under 200 words.
        PROMPT

        response = chat.ask(prompt)
        halt response.content.strip
      rescue => e
        "Could not simplify: #{e.message}"
      end
    end
  end
end
