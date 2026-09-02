# frozen_string_literal: true

module Commerce
  # Provider webhooks are authenticated by raw-body signature, never by session,
  # so browser CSRF does not apply and must be skipped explicitly.
  class WebhooksController < ActionController::Base
    skip_forgery_protection

    def lemon_squeezy
      provider = PaymentProvider.resolve
      return head(:service_unavailable) unless provider.available?

      # The RAW body, before Rails parses anything. Reading `params` first would
      # mean validating fields an attacker chose.
      raw_body = request.raw_post
      signature = request.headers["X-Signature"]

      event = begin
        provider.adapter.verify_event(raw_body: raw_body, signature: signature)
      rescue PaymentProvider::SignatureError
        Rails.logger.warn("[Webhook] rejected an unsigned or wrongly signed delivery")
        return head(:unauthorized)
      rescue PaymentProvider::Error
        return head(:bad_request)
      end

      # Task 6 processes `order_created` only. A refund handler is future work;
      # routing an unsupported event name to OrderProcessor still durably
      # records it (as "unsupported_event") rather than silently dropping it.
      result = OrderProcessor.call(event: event, provider_name: provider.adapter.name)

      # A duplicate or business rejection is still a delivery we have durably
      # recorded, so acknowledge it: making the provider retry forever helps
      # nobody and the row already says why.
      head(result.processed? ? :ok : :accepted)
    end
  end
end
