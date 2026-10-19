# frozen_string_literal: true

module ContentEngine
  module Tools
    # A tool's output that is the answer: it ends the turn and never goes back to
    # the model (generate_image's is a data URL). ruby_llm 2 removed halt, and a
    # tool result no longer ends its loop, so the caller runs the loop.
    Final = Data.define(:content) do
      def to_s = content.to_s

      # Asks +prompt+ and steps until the model answers or a tool returns a Final.
      # Returns that Final (the last one when a round returns several, as halt
      # did) or the model's message.
      def self.ask(chat, prompt)
        final = nil
        chat.after_tool_result { |result| final = result if result.is_a?(Final) }
        chat.ask_later(prompt)
        chat.step until final || chat.complete? || chat.waiting?
        final || chat.messages.last
      end
    end
  end
end
