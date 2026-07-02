# frozen_string_literal: true

module LearningRoutesEngine
  class TutorChatsController < ::ApplicationController
    before_action :authenticate_user!
    before_action :set_step
    before_action :authorize_step_owner!

    def index
      @messages = TutorMessage.where(user: current_user, step: @step).order(created_at: :asc).last(20)
      render partial: "learning_routes_engine/tutor_chats/messages", locals: { messages: @messages }
    end

    def create
      @message = TutorMessage.create!(
        user: current_user,
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
      @step = RouteStep.includes(learning_route: :learning_profile).find_by(id: params[:step_id])
      head(:not_found) unless @step
    end

    # Only the owner of the step's route may read or post tutor messages.
    # Without this, any authenticated user could POST against another user's
    # step id, read their lesson content back via the reply, and run billable
    # AI jobs on arbitrary steps (IDOR).
    def authorize_step_owner!
      unless @step&.learning_route&.learning_profile&.user_id == current_user.id
        head :forbidden
      end
    end
  end
end
