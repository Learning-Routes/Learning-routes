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

      Analytics::StudySession.create!(
        user: current_user,
        learning_route: @route,
        route_step: @step,
        started_at: Time.current
      )

      respond_to do |format|
        format.html
        format.turbo_stream
      end
    end

    private

    def set_assessment
      @assessment = Assessment.find(params[:id])
    end

    def authorize_assessment_owner!
      step = @assessment.route_step
      route = step.learning_route
      unless route.learning_profile.user_id == current_user.id
        redirect_to main_app.dashboard_path, alert: "Not authorized."
      end
    end
  end
end
