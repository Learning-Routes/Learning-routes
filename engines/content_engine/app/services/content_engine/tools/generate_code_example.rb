# frozen_string_literal: true

module ContentEngine
  module Tools
    class GenerateCodeExample < RubyLLM::Tool
      description "Generates a code example with explanation. " \
                  "Use this when the user asks to see code, wants a programming example, " \
                  "or when the topic involves programming concepts."

      param :concept, desc: "The concept to demonstrate with code"
      param :language, desc: "Programming language: python, javascript, ruby, java, etc.", required: false
      param :difficulty, desc: "Difficulty level: beginner, intermediate, advanced", required: false

      def execute(concept:, language: "python", difficulty: "beginner")
        chat = RubyLLM.chat(model: "gpt-4.1-mini")
        prompt = <<~PROMPT
          Write a #{difficulty}-level #{language} code example that demonstrates: #{concept}

          Format:
          1. Brief explanation (2-3 sentences)
          2. Code block with ```#{language} fence
          3. Expected output in a separate code block if applicable
          4. One key takeaway

          Keep it concise and educational.
        PROMPT

        response = chat.ask(prompt)
        halt response.content.strip
      rescue => e
        "Could not generate code example: #{e.message}"
      end
    end
  end
end
