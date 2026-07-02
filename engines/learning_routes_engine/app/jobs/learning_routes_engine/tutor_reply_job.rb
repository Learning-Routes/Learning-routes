# frozen_string_literal: true

module LearningRoutesEngine
  class TutorReplyJob < ApplicationJob
    queue_as :default

    def perform(tutor_message_id)
      message = TutorMessage.find(tutor_message_id)
      step = message.step
      route = step.learning_route
      user = message.user
      profile = route.learning_profile

      # Build context
      recent = TutorMessage.where(user: user, step: step).order(created_at: :asc).last(10)
      lesson_content = step.ai_contents&.first&.body.to_s.truncate(2000)

      locale = route.locale || user.locale || "en"
      history = recent.map { |m| "#{m.role}: #{m.content.truncate(200)}" }.join("\n")

      # Set thread context for tools
      Thread.current[:lesson_agent_user] = user
      Thread.current[:lesson_agent_locale] = locale

      # Route through the dedicated tutor_reply task type so the prompt template
      # actually consumes the student's question, the lesson context, and the
      # conversation history. Previously this used :lesson_content and dropped
      # all of that, so every reply was a generic lesson regeneration.
      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :tutor_reply,
        variables: {
          student_message: message.content.to_s,
          lesson_content: lesson_content,
          history: history,
          topic: step.localized_title,
          route_topic: route.localized_topic,
          locale: locale,
          target_locale: route.target_locale.to_s,
          user_name: user.name.to_s,
          user_level: profile&.current_level || "beginner",
          learning_style: Array(profile&.learning_style).join(", ")
        },
        user: user,
        async: false
      )

      response_text = if interaction.completed?
        # Extract just the text content, not JSON
        raw = interaction.response.to_s
        begin
          parsed = JSON.parse(raw)
          parsed["content"] || raw
        rescue JSON::ParserError
          raw
        end
      else
        locale == "es" ? "Lo siento, no pude generar una respuesta. Intenta de nuevo." : "Sorry, I could not generate a response. Please try again."
      end

      # Save assistant reply
      reply = TutorMessage.create!(
        user: user,
        step: step,
        role: "assistant",
        content: response_text.truncate(3000),
        metadata: { ai_interaction_id: interaction.id }
      )

      # Broadcast via Turbo Stream
      Turbo::StreamsChannel.broadcast_append_to(
        "tutor_chat_step_#{step.id}",
        target: "tutor-messages-#{step.id}",
        partial: "learning_routes_engine/tutor_chats/message",
        locals: { message: reply }
      )
    rescue => e
      Rails.logger.error("[TutorReplyJob] Failed: #{e.message}")
    ensure
      Thread.current[:lesson_agent_user] = nil
      Thread.current[:lesson_agent_locale] = nil
    end
  end
end
