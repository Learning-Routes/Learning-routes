module Assessments
  class AssessmentsController < ApplicationController
    layout "learning"

    before_action :authenticate_user!
    before_action :set_assessment
    before_action :authorize_assessment_owner!

    def show
      @questions_count = @assessment.questions.count
      @existing_result = AssessmentResult.find_by(user: current_user, assessment: @assessment)
      @step = @assessment.route_step
      @route = @step.learning_route
    end

    # POST: mutate, then redirect. Never render.
    #
    # Turbo requires a form submission to end in a redirect or a turbo_stream.
    # A 200 with an HTML body is discarded with "Form responses must redirect to
    # another location", which is exactly what the student saw after the 406 was
    # fixed: the button worked, the server answered, and the page did not move.
    #
    # 303 See Other is not cosmetic — it is what tells the browser to follow with
    # a GET. A 302 would re-issue the POST.
    def start
      existing = AssessmentResult.find_by(user: current_user, assessment: @assessment, score: nil)
      existing || AssessmentResult.create!(user: current_user, assessment: @assessment)

      step = @assessment.route_step
      step.update!(status: :in_progress) if step.available?

      Analytics::StudySession.find_or_create_by!(
        user: current_user,
        learning_route: step.learning_route,
        route_step: step,
        ended_at: nil
      ) { |s| s.started_at = Time.current }

      redirect_to take_assessment_path(@assessment), status: :see_other
    end

    # GET: render the exam. Creates nothing.
    #
    # A GET that created an AssessmentResult would hand one out to every refresh,
    # every back-button and every prefetch. If there is no result in progress the
    # student has not started, so send them to the intro card that has the button.
    def take
      @result = AssessmentResult.find_by(user: current_user, assessment: @assessment, score: nil)
      return redirect_to assessment_path(@assessment), status: :see_other if @result.nil?

      @questions = @assessment.questions.order(:created_at)
      @step = @assessment.route_step
      @route = @step.learning_route
    end

    private

    # Eager-loads the chain every action here walks: route_step -> learning_route
    # -> learning_profile. This was a bare `find`, and `authorize_assessment_owner!`
    # — a before_action, so it runs on EVERY request to this controller —
    # immediately does `@assessment.route_step.learning_route.learning_profile`.
    # Three lazy hops, which `strict_loading_by_default` only LOGS in production,
    # so it has been an N+1 on every exam page rather than a visible failure.
    def set_assessment
      @assessment = Assessment
        .includes(route_step: { learning_route: :learning_profile })
        .find(params[:id])
    end

    def authorize_assessment_owner!
      step = @assessment.route_step
      route = step.learning_route
      unless route.learning_profile&.user_id == current_user.id
        redirect_to main_app.dashboard_path, alert: t("flash.not_authorized")
        nil
      end
    end
  end
end
