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
