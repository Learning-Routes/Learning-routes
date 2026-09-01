# No fee schedule is assumed. Deployments must supply verified account-specific
# values before route quoting can become available.
Rails.application.config.x.commerce_fee_configuration = {
  percentage_basis_points: ENV["LEMON_SQUEEZY_FEE_BASIS_POINTS"],
  fixed_cents: ENV["LEMON_SQUEEZY_FEE_FIXED_CENTS"],
  version: ENV["LEMON_SQUEEZY_FEE_VERSION"]
}.freeze
