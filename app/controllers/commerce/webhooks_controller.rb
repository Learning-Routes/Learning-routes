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

      # Task 6 processes `order_created` only. Every other signed event type
      # (today, only `order_refunded`) is still routed to OrderProcessor, which
      # claims its identity FIRST and only then rejects it as
      # "unsupported_event" — so it is durably recorded, not silently dropped.
      # Task 9 adds a real refund handler and will intercept `order_refunded`
      # here, before OrderProcessor is consulted at all; OrderProcessor must
      # never be the thing that claims a refund's identity in the finished
      # system.
      result = OrderProcessor.call(event: event, provider_name: provider.adapter.name)

      # A duplicate or business rejection is still a delivery we have durably
      # recorded, so acknowledge it: making the provider retry forever helps
      # nobody and the row already says why.
      head(result.processed? ? :ok : :accepted)
    end
  end
end
