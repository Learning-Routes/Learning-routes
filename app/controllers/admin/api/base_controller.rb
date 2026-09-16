module Admin
  module Api
    # The studio's door. Deliberately NOT Admin::BaseController: that one requires a
    # signed-in owner (`current_user&.owner?`) and renders HTML, and the studio is a
    # Python script with no session. What it borrows is the discipline —
    # Cache-Control: private, no-store, and an OwnerAuditEvent for every call.
    class BaseController < ActionController::API
      include ActionController::HttpAuthentication::Token::ControllerMethods

      before_action :authenticate_studio!
      before_action :secure_api_response!
      after_action :audit_studio_access!

      private

      def authenticate_studio!
        expected = Rails.application.credentials.dig(:studio, :api_token).to_s

        # A missing credential means the API is OFF. Without this line an unset
        # credential is "" and a caller sending "" would compare equal.
        return head(:unauthorized) if expected.blank?

        authenticate_or_request_with_http_token do |token, _options|
          ActiveSupport::SecurityUtils.secure_compare(token.to_s, expected)
        end
      end

      def secure_api_response!
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["Pragma"] = "no-cache"
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
      end

      def audit_studio_access!
        return unless response.successful?

        OwnerAuditEvent.record!(
          action: "owner.studio_api", actor: nil, request: request,
          metadata: { controller: controller_path, action: action_name, status: response.status }
        )
      end
    end
  end
end
