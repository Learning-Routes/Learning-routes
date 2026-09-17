module Admin
  module Api
    # The studio's door. Deliberately NOT Admin::BaseController: that one requires a
    # signed-in owner (`current_user&.owner?`) and renders HTML, and the studio is a
    # Python script with no session. What it borrows is the discipline —
    # Cache-Control: private, no-store, and an OwnerAuditEvent for every call.
    class BaseController < ActionController::API
      include ActionController::HttpAuthentication::Token::ControllerMethods

      # An AROUND action, and declared FIRST so it wraps everything below it.
      # `after_action` cannot do this job: a `before_action` that renders halts the
      # callback chain and the after_actions never run, so the 413 from
      # `StepVideosController#refuse_oversized_body!` and the 404 from its
      # `load_step` both left no trace (measured, both of them). An around callback's
      # post-yield code runs even when an inner before_action halts, which is what
      # "every call" requires.
      around_action :audit_studio_access!
      before_action :authenticate_studio!
      before_action :secure_api_response!

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

        # The flag, not the status code, is what `audit_studio_access!` reads. It is
        # assigned here because this block is the ONLY place a token is accepted:
        # a blank token never reaches it (see above), a mismatched one sets it false
        # and `authenticate_or_request_with_http_token` answers 401, and a match sets
        # it true.
        authenticate_or_request_with_http_token do |token, _options|
          @studio_authenticated = ActiveSupport::SecurityUtils.secure_compare(token.to_s, expected)
        end
      end

      def secure_api_response!
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["Pragma"] = "no-cache"
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
      end

      # EVERY authenticated call, whatever its status. Spec §6 says this controller
      # records an OwnerAuditEvent "for every call", and the 2xx-only version this
      # replaced was blind to every answer worth finding in a log: the 409 from a
      # refused unpublish (the studio trying to re-point recorded student work), the
      # 422 from a refused upload, the 413 from an oversized one, the 404 from a step
      # id that does not exist.
      #
      # The 401s are excluded, and deliberately: an unauthenticated caller must not be
      # able to write rows into `owner_audit_events`, and the per-token throttle cannot
      # stop that particular flood — a request carrying no Authorization header
      # discriminates to nil and Rack::Attack does not throttle a nil discriminator,
      # which is the boundary already written down at the throttle itself
      # (rack_attack.rb:85-87). Hence a flag set on the authentication path rather than
      # a status code, which cannot tell "refused by us" from "refused at the door".
      #
      # An exception on the way through is NOT audited: this `yield` is not wrapped in
      # an `ensure`, because a write attempted while an exception is in flight can
      # raise its own and replace the error the owner needs to see.
      def audit_studio_access!
        yield

        return unless @studio_authenticated

        OwnerAuditEvent.record!(
          action: "owner.studio_api", actor: nil, request: request,
          metadata: { controller: controller_path, action: action_name, status: response.status }
        )
      end
    end
  end
end
