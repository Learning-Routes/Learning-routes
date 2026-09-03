# frozen_string_literal: true

module Commerce
  # The durable entitlement. A checkout is an intention; only this record, moved
  # to `paid` by a signature-verified webhook, unlocks anything.
  class RoutePurchase < ApplicationRecord
    self.table_name = "commerce_route_purchases"

    STATES = %w[pending paid failed refunded].freeze

    belongs_to :user, class_name: "Core::User"
    belongs_to :learning_route, class_name: "LearningRoutesEngine::LearningRoute"
    belongs_to :route_quote, class_name: "Commerce::RouteQuote"

    validates :state, inclusion: { in: STATES }
    validates :provider, presence: true
    validates :currency, inclusion: { in: ["USD"] }
    validates :amount_cents, :estimated_ai_cost_microcents, :estimated_fee_cents,
      numericality: { only_integer: true, greater_than_or_equal_to: 0 }
    validates :actual_fee_cents, :refunded_amount_cents,
      numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
    validate :amount_matches_quote
    validate :user_owns_learning_route

    scope :paid, -> { where(state: "paid") }
    scope :active_for_route, ->(route_id) { where(learning_route_id: route_id).where(state: %w[pending paid]) }
    # A refund revokes nothing per spec (route-commerce-owner-dashboard-design.md
    # line 246/316: automated post-refund access revocation is explicitly
    # deferred). A refunded customer keeps what they already bought.
    scope :entitling, -> { where(state: %w[paid refunded]) }

    def paid?     = state == "paid"
    def pending?  = state == "pending"
    def refunded? = state == "refunded"

    # Entitlement in one bounded query. This is the hot path behind every locked
    # step read, so it must never load a record or traverse an association.
    #
    # A refunded purchase still counts: automatic post-refund access
    # revocation is deliberately deferred (spec: route-commerce-owner-dashboard
    # -design.md lines 246 and 316). Do not narrow this back to `paid` alone —
    # that would revoke access the instant a refund is recorded, which the
    # approved spec explicitly forbids absent a separate policy decision.
    def self.entitled?(route_id:)
      return false if route_id.blank?

      entitling.where(learning_route_id: route_id).exists?
    end

    # Spending money on NEW AI generation is a different question from read
    # access, and must NOT follow the refunded-still-counts rule above: a
    # refunded route must stop costing us money even though the customer keeps
    # reading what was already generated. One bounded query, same shape as
    # `entitled?`, deliberately `paid` only.
    def self.generation_authorized?(route_id:)
      return false if route_id.blank?

      paid.where(learning_route_id: route_id).exists?
    end

    def mark_paid!(order_id:, actual_fee_cents:, paid_at:, order_attributes: {})
      update!(order_attributes.merge(
        state: "paid", provider_order_id: order_id,
        actual_fee_cents: actual_fee_cents, paid_at: paid_at, failure_reason: nil
      ))
    end

    def mark_refunded!(refunded_amount_cents:, refunded_at:)
      update!(state: "refunded", refunded_amount_cents: refunded_amount_cents, refunded_at: refunded_at)
    end

    def mark_failed!(reason:)
      update!(state: "failed", failure_reason: reason.to_s.truncate(255))
    end

    private

    # The amount is never taken from the browser or the provider; it is the
    # quote's own final price, re-checked here and again by a database trigger.
    def amount_matches_quote
      return if route_quote_id.blank? || amount_cents.blank?

      match = RouteQuote.where(id: route_quote_id, learning_route_id: learning_route_id,
                               user_id: user_id, final_price_cents: amount_cents,
                               currency: currency).exists?
      errors.add(:amount_cents, "must equal its quote's final price for the same user and route") unless match
    end

    def user_owns_learning_route
      return if user_id.blank? || learning_route_id.blank?

      profile_ids = LearningRoutesEngine::LearningRoute.where(id: learning_route_id).select(:learning_profile_id)
      return if LearningRoutesEngine::LearningProfile.where(id: profile_ids, user_id: user_id).exists?

      errors.add(:user, "must own the learning route")
    end
  end
end
