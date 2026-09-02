# frozen_string_literal: true

module Commerce
  class RouteQuote < ApplicationRecord
    self.table_name = "commerce_route_quotes"

    IMMUTABLE_ATTRIBUTES = %w[
      user_id learning_route_id currency total_module_count paid_module_count
      estimated_ai_cost_microcents estimated_fee_cents markup_basis_points
      minimum_price_per_paid_module_cents cost_based_price_cents minimum_price_cents
      final_price_cents estimator_version provider_rate_versions fee_version image_quality
      route_shape_assumptions provider_rate_assumptions fee_assumptions expires_at created_at
    ].freeze

    belongs_to :user, class_name: "Core::User"
    belongs_to :learning_route, class_name: "LearningRoutesEngine::LearningRoute"
    has_many :route_purchases, class_name: "Commerce::RoutePurchase",
             foreign_key: :route_quote_id, dependent: :restrict_with_error

    validates :currency, inclusion: { in: ["USD"] }
    validates :total_module_count, numericality: { only_integer: true, greater_than_or_equal_to: 1 }
    validates :paid_module_count, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
    validates :estimated_ai_cost_microcents, :estimated_fee_cents, :cost_based_price_cents,
      :minimum_price_cents, :final_price_cents,
      numericality: { only_integer: true, greater_than_or_equal_to: 0 }
    validates :markup_basis_points,
      inclusion: { in: [Commerce::PricingConstants::MARKUP_BASIS_POINTS] }
    validates :minimum_price_per_paid_module_cents,
      inclusion: { in: [Commerce::PricingConstants::MINIMUM_PRICE_PER_PAID_MODULE_CENTS] }
    validates :estimator_version, :fee_version, :image_quality, presence: true
    validates :provider_rate_versions, :route_shape_assumptions,
      :provider_rate_assumptions, :fee_assumptions, presence: true
    validates :expires_at, presence: true
    validates :attachment_state, inclusion: { in: %w[unattached checkout purchase] }
    validate :counts_and_prices_match
    validate :expiration_is_future, on: :create
    validate :user_owns_learning_route
    validate :pricing_snapshot_is_immutable, on: :update

    scope :active, -> { where(superseded_at: nil) }
    scope :unattached, -> { where(attachment_state: "unattached") }

    ATTACHMENT_STATES = %w[unattached checkout purchase].freeze

    def attached? = attachment_state != "unattached"

    # `unattached -> checkout -> purchase` only, and never backwards. An attached
    # quote is the price the customer agreed to; nothing may move it.
    def attach!(state)
      raise ArgumentError, "unknown attachment state #{state}" unless ATTACHMENT_STATES.include?(state)

      allowed = { "unattached" => ["checkout"], "checkout" => ["purchase"], "purchase" => [] }
      unless allowed.fetch(attachment_state, []).include?(state)
        raise ArgumentError, "cannot move an attached quote from #{attachment_state} to #{state}"
      end

      update!(attachment_state: state)
    end

    def self.create_snapshot!(attributes)
      route = LearningRoutesEngine::LearningRoute.find(attributes.fetch(:learning_route).id)
      route.with_lock do
        quote = create!(attributes)
        where(learning_route_id: route.id, superseded_at: nil, attachment_state: "unattached")
          .where.not(id: quote.id).update_all(superseded_at: Time.current, updated_at: Time.current)
        quote
      end
    end

    private

    def counts_and_prices_match
      if total_module_count && paid_module_count != total_module_count - 1
        errors.add(:paid_module_count, "must equal total modules minus the preview")
      end
      expected_minimum = paid_module_count.to_i * minimum_price_per_paid_module_cents.to_i
      errors.add(:minimum_price_cents, "must equal the paid-module minimum") if minimum_price_cents != expected_minimum
      expected_final = [cost_based_price_cents.to_i, minimum_price_cents.to_i].max
      errors.add(:final_price_cents, "must be the greater approved price") if final_price_cents != expected_final
    end

    def pricing_snapshot_is_immutable
      return unless IMMUTABLE_ATTRIBUTES.any? { |attribute| will_save_change_to_attribute?(attribute) }

      errors.add(:base, "pricing snapshots are immutable")
    end

    def expiration_is_future
      errors.add(:expires_at, "must be in the future") if expires_at && expires_at <= Time.current
    end

    def user_owns_learning_route
      return if user_id.blank? || learning_route_id.blank?

      profile_ids = LearningRoutesEngine::LearningRoute.where(id: learning_route_id).select(:learning_profile_id)
      return if LearningRoutesEngine::LearningProfile.where(id: profile_ids, user_id: user_id).exists?

      errors.add(:user, "must own the learning route")
    end
  end
end
