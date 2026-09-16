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

        # A missing credential means the API is OFF, and this line is the only thing
        # in this file that says so. It is worth being exact about what it defends,
        # because the first version of this comment claimed a bypass that Rails
        # already blocks, and a comment in this repo may not carry an unverified
        # claim.
        #
        # Measured: `secure_compare("", "")` is TRUE. An unset credential really
        # would admit an empty token. What stops that today is one level further
        # out — `ActionController::HttpAuthentication::Token.authenticate` wraps
        # `login_procedure.call` in `unless token.blank?`, so an empty token never
        # reaches the comparison at all (actionpack 8.1.3.1). `secure_compare` then
        # refuses everything else by bytesize.
        #
        # So this line is unreachable through the method below, and deliberately
        # kept: it is what holds if anyone reads `request.headers["Authorization"]`
        # by hand instead. `base_controller_test.rb` pins that with an empty-token
        # request, proven against exactly that refactor.
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
