module Admin
  class BaseController < ApplicationController
    skip_before_action :require_email_verification!
    before_action :secure_admin_response!
    before_action :require_owner!
    before_action :audit_owner_access!

    layout "application"

    private

    def secure_admin_response!
      response.headers["Cache-Control"] = "private, no-store"
      response.headers["Pragma"] = "no-cache"
      response.headers["X-Robots-Tag"] = "noindex, nofollow"
    end

    def require_owner!
      return if current_user&.owner?

      respond_to do |format|
        format.html { render "admin/forbidden", status: :forbidden, layout: false }
        format.json { render json: { error: "forbidden" }, status: :forbidden }
        format.any { head :forbidden }
      end
    end

    def audit_owner_access!
      OwnerAuditEvent.record!(
        action: "owner.admin_access",
        actor: current_user,
        request: request,
        metadata: { controller: controller_path, action: action_name }
      )
    end
  end
end
