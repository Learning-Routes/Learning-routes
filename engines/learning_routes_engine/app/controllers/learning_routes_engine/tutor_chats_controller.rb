# frozen_string_literal: true

module LearningRoutesEngine
  class TutorChatsController < ::ApplicationController
    before_action :authenticate_user!
    before_action :authorize_module_access!
    # `create` enqueues a billable TutorReplyJob. Reading the transcript back
    # survives a refund; commissioning a new reply does not.
    before_action :authorize_module_generation!, only: :create
    before_action :set_step

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
    # The IDOR gate: this user does not own this step, or the module is locked.
    # Stays a HARD, EMPTY 403 — `module_lock_authorization_test` asserts the empty
    # body, and a forged step id must learn nothing from the answer, not even a
    # friendly sentence.
    def authorize_module_access!
      return if ModuleAccessPolicy.allowed?(user: current_user, route_id: params[:route_id], step_id: params[:step_id])

      head :forbidden
    end

    def authorize_module_generation!
      return if ModuleAccessPolicy.generation_allowed?(
        user: current_user, route_id: params[:route_id], step_id: params[:step_id]
      )

      refuse(:send_forbidden)
    end

    # A refusal the student can read, for the gate they can legitimately hit:
    # they OWN this step and the route was refunded, so no new paid reply may be
    # commissioned. `head :forbidden` sent an empty body and `send()` had no
    # `else`, so the skeleton pulsed forever and said nothing. Same shape as
    # `Assessments::AnswersController#refuse` — the reason is in the body so the
    # widget can say it. The access gate above stays empty on purpose.
    def refuse(reason)
      render json: { error: reason, message: t("tutor.#{reason}") }, status: :forbidden
    end
  end
end
