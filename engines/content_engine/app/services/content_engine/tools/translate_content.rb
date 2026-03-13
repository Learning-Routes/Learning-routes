# frozen_string_literal: true

module ContentEngine
  module Tools
    class TranslateContent < RubyLLM::Tool
      description "Translates content between languages. " \
                  "Use this for language-learning routes when the user needs a translation, " \
                  "wants to see content in another language, or needs vocabulary help."

      param :content, desc: "The text content to translate"
      param :from_locale, desc: "Source language code: en, es, fr, de, etc."
      param :to_locale, desc: "Target language code: en, es, fr, de, etc."

      def execute(content:, from_locale:, to_locale:)
        chat = RubyLLM.chat(model: "gpt-4.1-mini")
        prompt = <<~PROMPT
          Translate the following from #{from_locale} to #{to_locale}.
          Include pronunciation hints in parentheses for key words.
          Preserve any markdown formatting.

          Text:
          #{content}
        PROMPT

        response = chat.ask(prompt)
        halt response.content.strip
      rescue => e
        "Could not translate: #{e.message}"
      end
    end
  end
end
