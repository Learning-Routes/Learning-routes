# frozen_string_literal: true

module LearningRoutesEngine
  class TutorChatsController < ::ApplicationController
    before_action :set_step

    def index
      @messages = TutorMessage.where(user: Current.user, step: @step).order(created_at: :asc).last(20)
      render partial: "learning_routes_engine/tutor_chats/messages", locals: { messages: @messages }
    end

    def create
      @message = TutorMessage.create!(
        user: Current.user,
        step: @step,
        role: "user",
        content: params[:message].to_s.strip.truncate(2000)
      )

      # Enqueue AI reply
      TutorReplyJob.perform_later(@message.id)

      respond_to do |format|
        format.turbo_stream do
          render turbo_stream: turbo_stream.append(
            "tutor-messages-#{@step.id}",
            partial: "learning_routes_engine/tutor_chats/message",
            locals: { message: @message }
          )
        end
        format.html { redirect_back fallback_location: "/" }
      end
    end

    private

    def set_step
      @step = RouteStep.find(params[:step_id])
    end
  end
end
