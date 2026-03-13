# frozen_string_literal: true

module ContentEngine
  class LessonAssistantAgent
    MAX_INTERACTIONS_PER_LESSON = 10

    TOOLS = [
      Tools::GenerateDiagram,
      Tools::GenerateImage,
      Tools::GenerateCodeExample,
      Tools::SimplifyExplanation,
      Tools::TranslateContent
    ].freeze

    attr_reader :step, :route, :user, :section, :locale

    def initialize(step:, user:, section: nil)
      @step = step
      @route = step.learning_route
      @user = user
      @profile = @route.learning_profile
      @section = section || {}
      @locale = @route.locale || user&.locale || "en"
    end

    # Main entry point — the agent decides which tools to use
    def interact(action:, message: nil)
      check_rate_limit!

      # Set thread-local context for tools that need user/locale
      Thread.current[:lesson_agent_user] = @user
      Thread.current[:lesson_agent_locale] = @locale

      chat = build_chat
      user_prompt = build_user_prompt(action, message)

      start_time = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      response = chat.ask(user_prompt)
      elapsed_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round

      result = parse_response(response)

      track_interaction!(action, message, result,
        input_tokens: response.input_tokens || 0,
        output_tokens: response.output_tokens || 0,
        latency_ms: elapsed_ms
      )
      result
    ensure
      Thread.current[:lesson_agent_user] = nil
      Thread.current[:lesson_agent_locale] = nil
    end

    private

    def build_chat
      chat = RubyLLM.chat(model: "gpt-4.1-mini")
      chat.with_instructions(system_prompt)
      chat.with_tools(*TOOLS)
      chat
    end

    def system_prompt
      target_locale = @route.target_locale
      language_context = if target_locale.present?
        "This is a LANGUAGE LEARNING route. The student speaks #{@locale} and is learning #{target_locale}. " \
        "You can use the translate_content tool for translation requests."
      else
        ""
      end

      history_context = build_conversation_history

      <<~PROMPT
        You are a helpful learning assistant embedded in an interactive lesson.
        You help the student understand the current section better.

        Context:
        - Subject: #{@route.localized_topic}
        - Student level: #{@profile&.current_level || 'beginner'}
        - Learning style: #{Array(@profile&.learning_style).join(', ').presence || 'mixed'}
        - Content language: #{@locale}
        #{language_context}

        Current section:
        - Type: #{@section[:type]}
        - Title: #{@section[:title]}
        - Content: #{@section[:body].to_s.truncate(1500)}
        #{history_context}
        You have tools available. Use them when appropriate:
        - generate_diagram: When the student needs a visual/flowchart/diagram explanation
        - generate_image: When an artistic illustration would help (not a diagram)
        - generate_code_example: When the student wants to see code
        - simplify_explanation: When the student doesn't understand and needs simpler text
        - translate_content: When the student needs content in another language

        Guidelines:
        - Respond in #{@locale} language
        - Be concise but thorough
        - If no tool is needed, just provide a helpful text response
        - Match your explanation level to the student's level
        - Use markdown formatting (bold, lists, etc.)
      PROMPT
    end

    def build_user_prompt(action, message)
      case action.to_s
      when "explain_differently"
        message.presence || "Please explain this concept differently. Use a different angle, analogy, or approach."
      when "give_example"
        message.presence || "Give me a practical, real-world example of this concept."
      when "simplify"
        message.presence || "I don't understand this. Please simplify it for me."
      when "deepen"
        message.presence || "I want to go deeper into this topic. Give me more advanced details."
      when "show_diagram"
        message.presence || "Show me a diagram that illustrates this concept visually."
      when "show_image"
        message.presence || "Generate an educational image that helps visualize this concept."
      when "show_code"
        message.presence || "Show me a code example that demonstrates this concept."
      when "translate"
        target = @route.target_locale || "en"
        message.presence || "Translate the key vocabulary in this section to #{target}."
      else
        message.presence || "Help me understand this better."
      end
    end

    def parse_response(response)
      content = response.content.to_s.strip

      if content.blank?
        return { type: "text", content: "I couldn't generate a response. Please try again." }
      end

      # Detect response type from content patterns
      type = if content.include?("```mermaid")
               "diagram"
             elsif content.match?(/!\[.*?\]\(data:image\//)
               "image"
             elsif content.match?(/!\[.*?\]\(https?:\/\//)
               "image"
             elsif content.match?(/```\w+/)
               "code"
             else
               "text"
             end

      { type: type, content: content }
    end

    def build_conversation_history
      # Subquery to get last 5 in chronological order
      recent = AiOrchestrator::AiInteraction
        .where(user: @user)
        .where("metadata->>'step_id' = ?", @step.id.to_s)
        .where("metadata->>'agent_interaction' = ?", "true")
        .where("created_at > ?", 1.hour.ago)
        .order(created_at: :asc)
        .last(5)

      return "" if recent.empty?

      lines = recent.map do |interaction|
        action = interaction.metadata&.dig("action") || "unknown"
        prompt_text = interaction.prompt.to_s.truncate(100)
        response_text = interaction.response.to_s.truncate(200)
        "- Student asked (#{action}): #{prompt_text}\n  You replied: #{response_text}"
      end

      "\nRecent conversation in this lesson:\n#{lines.join("\n")}\n"
    end

    def check_rate_limit!
      count = AiOrchestrator::AiInteraction
        .where(user: @user)
        .where("metadata->>'step_id' = ?", @step.id.to_s)
        .where("metadata->>'agent_interaction' = ?", "true")
        .where("created_at > ?", 1.hour.ago)
        .count

      if count >= MAX_INTERACTIONS_PER_LESSON
        raise RateLimitExceeded, "Maximum #{MAX_INTERACTIONS_PER_LESSON} AI interactions per lesson per hour"
      end
    end

    def track_interaction!(action, message, result, input_tokens: 0, output_tokens: 0, latency_ms: 0)
      AiOrchestrator::AiInteraction.create!(
        user: @user,
        model: "gpt-4.1-mini",
        task_type: "lesson_assistant",
        prompt: "#{action}: #{message}".truncate(500),
        status: :completed,
        response: result[:content].to_s.truncate(2000),
        input_tokens: input_tokens,
        output_tokens: output_tokens,
        latency_ms: latency_ms,
        cost_cents: AiOrchestrator::CostTracker.estimate_cost(
          model: "gpt-4.1-mini",
          input_tokens: input_tokens,
          output_tokens: output_tokens
        ),
        metadata: {
          step_id: @step.id,
          route_id: @route.id,
          action: action,
          response_type: result[:type],
          agent_interaction: "true"
        }
      )
    rescue => e
      Rails.logger.warn("[LessonAssistantAgent] Failed to track interaction: #{e.message}")
    end

    class RateLimitExceeded < StandardError; end
  end
end
