# frozen_string_literal: true

module ContentEngine
  module Tools
    class TranslateContent < RubyLLM::Tool
      description "Translates content between languages. " \
                  "Use this for language-learning routes when the user needs a translation, " \
                  "wants to see content in another language, or needs vocabulary help."

      parameter :content, description: "The text content to translate"
      parameter :from_locale, description: "Source language code: en, es, fr, de, etc."
      parameter :to_locale, description: "Target language code: en, es, fr, de, etc."

      def execute(content:, from_locale:, to_locale:)
        prompt = <<~PROMPT
          Translate the following from #{from_locale} to #{to_locale}.
          Include pronunciation hints in parentheses for key words.
          Preserve any markdown formatting.

          Text:
          #{content}
        PROMPT

        content = AiOrchestrator::TrackedTextCall.call(prompt: prompt, task_type: "translation")
        halt content.strip
      rescue => e
        "Could not translate: #{e.message}"
      end
    end
  end
end
