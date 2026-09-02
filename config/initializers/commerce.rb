# No fee schedule and no estimator shape are assumed. Deployments must supply
# verified, account-specific values before route quoting becomes available.
# Absent configuration blocks quoting and therefore checkout; it never yields a
# zero price or a guessed fee.
Rails.application.config.x.commerce_fee_configuration = {
  percentage_basis_points: Rails.application.credentials.dig(:lemon_squeezy, :fee_basis_points).presence ||
    ENV["LEMON_SQUEEZY_FEE_BASIS_POINTS"],
  fixed_cents: Rails.application.credentials.dig(:lemon_squeezy, :fee_fixed_cents).presence ||
    ENV["LEMON_SQUEEZY_FEE_FIXED_CENTS"],
  version: Rails.application.credentials.dig(:lemon_squeezy, :fee_version).presence ||
    ENV["LEMON_SQUEEZY_FEE_VERSION"]
}.freeze

# The estimator's per-call assumptions. Versioned so an old quote stays
# explainable after rates change. Supplied as YAML in credentials under
# `commerce.estimator`, or left absent to block quoting.
Rails.application.config.x.commerce_estimator =
  (Rails.application.credentials.dig(:commerce, :estimator) || {}).deep_symbolize_keys.freeze

# Lemon Squeezy credentials. Absent by default: no store, product, variant, API
# key or signing secret is committed, and no default is invented. Absent
# configuration blocks checkout creation and rejects every webhook.
Rails.application.config.x.commerce_payment_provider = {
  api_key: Rails.application.credentials.dig(:lemon_squeezy, :api_key).presence ||
    ENV["LEMON_SQUEEZY_API_KEY"],
  signing_secret: Rails.application.credentials.dig(:lemon_squeezy, :signing_secret).presence ||
    ENV["LEMON_SQUEEZY_SIGNING_SECRET"],
  store_id: Rails.application.credentials.dig(:lemon_squeezy, :store_id).presence ||
    ENV["LEMON_SQUEEZY_STORE_ID"],
  product_id: Rails.application.credentials.dig(:lemon_squeezy, :product_id).presence ||
    ENV["LEMON_SQUEEZY_PRODUCT_ID"],
  variant_id: Rails.application.credentials.dig(:lemon_squeezy, :variant_id).presence ||
    ENV["LEMON_SQUEEZY_VARIANT_ID"],
  # Live mode stays off until WP-4 and the payment-critical WP-8 findings close
  # and a human approves activation.
  #
  # NOT `.presence` here, unlike every string setting above. `false.blank?` is
  # true, so `false.presence` is nil: a credentials value of `test_mode: false`
  # fell through to the ENV default and resolved back to `true`. Live mode was
  # therefore unreachable through credentials, and an operator who set it
  # believed they were live while OrderProcessor's `mode_mismatch` check
  # rejected every real webhook — money taken, entitlement refused. `compact`
  # distinguishes "set to false" from "not set".
  test_mode: ActiveModel::Type::Boolean.new.cast(
    [
      Rails.application.credentials.dig(:lemon_squeezy, :test_mode),
      ENV["LEMON_SQUEEZY_TEST_MODE"].presence,
      true
    ].compact.first
  )
}.freeze
