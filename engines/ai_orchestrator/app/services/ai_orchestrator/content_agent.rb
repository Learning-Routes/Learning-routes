# frozen_string_literal: true

module AiOrchestrator
  class ContentAgent
    TOOL_CLASSES = [
      ContentEngine::Tools::WebSearch,
      ContentEngine::Tools::GenerateImage,
      ContentEngine::Tools::GenerateDiagram,
      ContentEngine::Tools::GenerateCodeExample,
      ContentEngine::Tools::AudioNarration,
      ContentEngine::Tools::UserProgress,
      ContentEngine::Tools::SimplifyExplanation,
      ContentEngine::Tools::TranslateContent
    ].freeze

    MODEL = "gpt-5.2"
    TEMPERATURE = 0.75
    MAX_OUTPUT_TOKENS = 8192

    INSTRUCTIONS = <<~PROMPT
      You are a world-class educational content designer with access to tools.
      You create lessons as engaging as the best learning apps (Duolingo, Brilliant, Khan Academy).

      AVAILABLE TOOLS — use them proactively when they would improve the lesson:
      - web_search: Search for current facts, statistics, or recent developments
      - generate_image: Create educational illustrations for visual concepts
      - generate_diagram: Create Mermaid diagrams for processes, flows, relationships
      - generate_code_example: Generate code snippets when the topic involves programming
      - audio_narration: Generate spoken audio for key sections
      - user_progress: Check the student's current level, streak, XP to personalize content
      - simplify_explanation: Simplify complex concepts for struggling students
      - translate_content: Translate content for bilingual routes

      TOOL USAGE GUIDELINES:
      - Use web_search FIRST if the topic involves recent events, statistics, or facts that may have changed
      - Use generate_image for at least 2 visual sections per lesson
      - Use generate_diagram for at least 2 diagrams per lesson (different types)
      - Use user_progress at the start to personalize difficulty
      - Do NOT use audio_narration unless specifically requested
      - Do NOT use tools unnecessarily — only when they genuinely improve the lesson

      You are generating structured educational content. Follow all formatting rules from the user prompt exactly.
    PROMPT

    attr_reader :chat

    # Build a new ContentAgent wrapping a RubyLLM::Chat with all tools wired up.
    #
    # @param model [String] override model (default: gpt-5.2)
    # @param params [Hash] additional provider options
    # @param on_tool_call [Proc] optional callback invoked before each tool call
    def initialize(model: MODEL, params: {}, on_tool_call: nil)
      @chat = RubyLLM
        .chat(model: model)
        .with_instructions(INSTRUCTIONS)
        .with_temperature(TEMPERATURE)
        .with_tools(*TOOL_CLASSES)
        .with_max_output_tokens(MAX_OUTPUT_TOKENS)
        .with_provider_options(params)

      @chat.before_tool_call { |call| on_tool_call.call(call) } if on_tool_call
    end

    # Send a prompt to the agent and return the response message.
    # The agent will autonomously invoke tools as needed, then return the final answer.
    #
    # @param prompt [String] the user-facing content generation prompt
    # @return [RubyLLM::Message, ContentEngine::Tools::Final] the model's answer, or the tool output that ended the turn
    def ask(prompt)
      ContentEngine::Tools::Final.ask(@chat, prompt)
    end

    # Access the conversation message history.
    def messages
      @chat.messages
    end

    def usage_totals
      provider_messages = messages.select { |message| message.role.to_s == "assistant" }
      return [nil, nil, nil, nil] if provider_messages.empty? || provider_messages.any? do |message|
        message.tokens.input.nil? || message.tokens.output.nil?
      end

      # cache_read and cache_write are nil from providers without a prompt cache
      [provider_messages.sum { |message| message.tokens.input }, provider_messages.sum { |message| message.tokens.output },
       provider_messages.sum { |message| message.tokens.cache_read.to_i },
       provider_messages.sum { |message| message.tokens.cache_write.to_i }]
    end

    # Access the model info.
    def model
      @chat.model
    end

    # Access the registered tools.
    def tools
      @chat.tools
    end
  end
end
