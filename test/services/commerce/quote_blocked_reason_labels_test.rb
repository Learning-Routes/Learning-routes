require "test_helper"

module Commerce
  # The owner dashboard renders `admin.quotes.blocked.<quote_blocked_reason>`
  # with `default: admin.quotes.blocked.not_quoted`. A reason with no label
  # therefore does not raise — it silently reads "No quote has been created",
  # which hides the real cause in the one place an operator goes to diagnose it.
  #
  # This test pins every reason a route can actually be blocked with to a label
  # in every locale the app ships, so adding a new blocking reason without a
  # translation fails here instead of degrading the dashboard in production.
  class QuoteBlockedReasonLabelsTest < ActiveSupport::TestCase
    # Every value that reaches `generation_params["quote_blocked_reason"]`:
    # the `reason` of each unavailable-configuration result that
    # WizardRouteGenerationJob#block_quote! is called with, plus the
    # catch-all it writes from its own rescue.
    BLOCKED_REASONS = %w[
      estimator_configuration_missing
      fee_configuration_missing
      pricing_configuration_missing
      no_paid_modules
      quote_error
      not_quoted
    ].freeze

    LOCALES = %i[en es].freeze

    test "every blocking reason has a distinct label in every locale" do
      LOCALES.each do |locale|
        fallback = I18n.t("admin.quotes.blocked.not_quoted", locale: locale)

        BLOCKED_REASONS.each do |reason|
          next if reason == "not_quoted"

          label = I18n.t("admin.quotes.blocked.#{reason}", locale: locale, default: nil)

          assert label.present?,
            "admin.quotes.blocked.#{reason} is missing in #{locale}; the dashboard " \
            "would silently fall back to \"#{fallback}\""
          assert_not_equal fallback, label,
            "admin.quotes.blocked.#{reason} in #{locale} is indistinguishable from the fallback"
        end
      end
    end

    # Guards the list above against drifting away from the code it mirrors.
    test "the reasons under test are the ones the services can actually emit" do
      emitted = Dir[Rails.root.join("app/services/commerce/*.rb")]
        .flat_map { |path| File.read(path).scan(/reason: "([a-z_]+)"/).flatten }
        .uniq

      configuration_reasons = emitted.grep(/_missing\z|\Ano_paid_modules\z/)

      configuration_reasons.each do |reason|
        assert_includes BLOCKED_REASONS, reason,
          "#{reason} can block a quote but has no label coverage here"
      end
    end
  end
end
