# frozen_string_literal: true

module LearningRoutesEngine
  class TutorReplyJob < ApplicationJob
    queue_as :default

    # Everything `perform` walks off the message, in one query.
    #
    # Production logged [StrictLoading] warnings for `#step` and `#user` on
    # 7 September and carried on, because it sets
    # `action_on_strict_loading_violation = :log`. The other three hops —
    # `step.learning_route`, `route.learning_profile` and `step.ai_contents` —
    # were the same defect one level deeper. In the TEST environment, where the
    # violation RAISES, the job's own `rescue` swallowed it and produced nothing
    # at all: the first version of this fix looked like it worked and was
    # silently delivering the failure notice on the happy path.
    MESSAGE_ASSOCIATIONS = {
      user: {},
      step: [:ai_contents, { learning_route: :learning_profile }]
    }.freeze

    def perform(tutor_message_id)
      # Eager-loaded: production logged two [StrictLoading] warnings here on
      # 7 September, for `#step` and `#user`. It logs rather than raises
      # (`action_on_strict_loading_violation = :log`), so this was an N+1 on a
      # paid path nobody could see — and in the TEST environment, where it does
      # raise, the bare `rescue` below swallowed it and the job silently produced
      # nothing at all.
      message = TutorMessage.includes(MESSAGE_ASSOCIATIONS).find(tutor_message_id)
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
          topic: step.localized_title(locale),
          route_topic: route.localized_topic(locale),
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

      deliver!(step: step, user: user, content: response_text.truncate(3000),
               metadata: { ai_interaction_id: interaction.id })
    rescue => e
      # The rescue is not the end of the story any more. It used to log and
      # return: no reply row, no broadcast, and a skeleton pulsing forever on the
      # student's screen. Every way in here is a way the student is owed a
      # sentence — `SpendGuard::LimitExceeded` most of all, because a refused
      # budget is the one failure that is certain to recur.
      #
      # `e.class` as well as the message: the log line that diagnosed WP-35 §2
      # was useless without it.
      Rails.logger.error("[TutorReplyJob] Failed: #{e.class}: #{e.message}")
      deliver_failure!(tutor_message_id)
    ensure
      Thread.current[:lesson_agent_user] = nil
      Thread.current[:lesson_agent_locale] = nil
    end

    private

    # One place that writes an assistant message and puts it on the page, so the
    # success path and the failure path cannot drift into saying different things
    # to different targets.
    def deliver!(step:, user:, content:, metadata: {})
      reply = TutorMessage.create!(
        user: user, step: step, role: "assistant",
        content: content, metadata: metadata
      )

      Turbo::StreamsChannel.broadcast_append_to(
        "tutor_chat_step_#{step.id}",
        target: "tutor-messages-#{step.id}",
        partial: "learning_routes_engine/tutor_chats/message",
        locals: { message: reply }
      )
      reply
    end

    # Re-reads the question rather than trusting anything the failed attempt left
    # in scope: this runs from a rescue, and the exception may have come from the
    # very first line.
    def deliver_failure!(tutor_message_id)
      message = TutorMessage.includes(MESSAGE_ASSOCIATIONS).find_by(id: tutor_message_id)
      return if message.nil?

      step = message.step
      locale = step.learning_route&.locale || message.user.locale || I18n.default_locale

      deliver!(step: step, user: message.user,
               content: I18n.t("tutor.unavailable", locale: locale),
               metadata: { "failed" => true })
    rescue => e
      # If even this fails the student is no worse off than before, but the log
      # must say so — a silent skeleton is what this whole method exists to stop.
      Rails.logger.error("[TutorReplyJob] Could not deliver a failure notice: #{e.class}: #{e.message}")
    end
  end
end
