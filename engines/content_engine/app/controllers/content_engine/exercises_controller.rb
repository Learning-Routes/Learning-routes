module ContentEngine
  # `submit_answer` and `get_hint` retired with the exercise code editor
  # (WP-35 §3). An exercise renders through the lesson machinery now, so its
  # practice is graded by BlockGrader per block, server-side and gated, instead
  # of by a paid `quick_grading` call over the contents of an Ace editor that
  # completed nothing. `exercise_hint` has no caller left either.
  #
  # `run_code` stays: it is a placeholder that costs nothing, and
  # `module_lock_authorization_test` asserts a locked module cannot reach it.
  class ExercisesController < ApplicationController
    before_action :authenticate_user!
    before_action :set_step_and_authorize!

    def run_code
      @output = t("flash.code_sandbox_placeholder")
      respond_to do |format|
        format.turbo_stream
        format.json { render json: { output: @output, status: "placeholder" } }
      end
    end

    private

    def set_step_and_authorize!
      return unless authorize_route_step_access!(params[:id])

      @step = LearningRoutesEngine::RouteStep.find(params[:id])
    end
  end
end
