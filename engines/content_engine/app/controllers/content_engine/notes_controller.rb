module ContentEngine
  class NotesController < ApplicationController
    before_action :authenticate_user!
    before_action :set_note, only: [:update, :destroy]

    def create
      step = LearningRoutesEngine::RouteStep.find(params[:route_step_id])
      return unless authorize_step_owner!(step)

      @note = UserNote.new(
        user: current_user,
        route_step: step,
        body: params[:body]
      )

      if @note.save
        respond_to do |format|
          format.turbo_stream {
            render turbo_stream: turbo_stream.replace("note_form",
              html: helpers.content_tag(:div, id: helpers.dom_id(@note)) {
                helpers.content_tag(:textarea,
                  @note.body,
                  "data-action" => "input->note-taking#save",
                  "data-note-id" => @note.id,
                  class: "w-full bg-gray-800/50 border border-white/[0.04] rounded-lg p-3 text-sm text-gray-300 placeholder-gray-600 resize-none focus:outline-none focus:border-indigo-500/30",
                  rows: 4, placeholder: "Add your notes...")
              })
          }
          format.html { redirect_back fallback_location: main_app.dashboard_path }
        end
      else
        respond_to do |format|
          format.html { redirect_back fallback_location: main_app.dashboard_path, alert: @note.errors.full_messages.join(", ") }
        end
      end
    end

    def update
      if @note.update(body: params[:body])
        respond_to do |format|
          format.turbo_stream { render turbo_stream: turbo_stream.replace(@note, partial: "content_engine/notes/note", locals: { note: @note }) }
          format.html { redirect_back fallback_location: main_app.dashboard_path }
        end
      else
        head :unprocessable_entity
      end
    end

    def destroy
      @note.destroy
      respond_to do |format|
        format.turbo_stream { render turbo_stream: turbo_stream.remove(@note) }
        format.html { redirect_back fallback_location: main_app.dashboard_path }
      end
    end

    private

    def set_note
      @note = UserNote.for_user(current_user).find(params[:id])
    end

    def authorize_step_owner!(step)
      unless step.learning_route.learning_profile.user_id == current_user.id
        head :forbidden
        return false
      end
      true
    end
  end
end
