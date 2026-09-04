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

    def start
      existing = AssessmentResult.find_by(user: current_user, assessment: @assessment, score: nil)
      @result = existing || AssessmentResult.create!(user: current_user, assessment: @assessment)
      @questions = @assessment.questions.order(:created_at)
      @step = @assessment.route_step
      @route = @step.learning_route

      @step.update!(status: :in_progress) if @step.available?

      Analytics::StudySession.find_or_create_by!(
        user: current_user,
        learning_route: @route,
        route_step: @step,
        ended_at: nil
      ) { |s| s.started_at = Time.current }

      # HTML ONLY. Starting an exam is a NAVIGATION, not an in-place update.
      #
      # `format.turbo_stream` was declared here and `start.turbo_stream.erb` has
      # never existed — `git log --diff-filter=A` on that path is empty. Both call
      # sites are a plain `button_to`, which Turbo intercepts and sends with
      # `Accept: text/vnd.turbo-stream.html, text/html, …`. `respond_to` picked
      # turbo_stream because it is first in that list, found no template, and
      # raised `ActionController::MissingExactTemplate` — which subclasses
      # `ActionController::UnknownFormat` and is therefore mapped to 406 Not
      # Acceptable. That is why the button did nothing at all.
      #
      # Declaring a format you cannot render is the defect; adding a template to
      # justify the declaration would be building a feature to cover a mistake.
      # `start.html.erb` is a full page (`content_for(:title)`, its own layout),
      # which is what the original intent looks like.
      respond_to do |format|
        format.html
      end
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
