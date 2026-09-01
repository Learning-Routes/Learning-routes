# frozen_string_literal: true

module Commerce
  class FeeConfiguration
    Available = Data.define(:percentage_basis_points, :fixed_cents, :version) do
      def available? = true

      def snapshot
        {
          "percentage_basis_points" => percentage_basis_points,
          "fixed_cents" => fixed_cents,
          "currency" => "USD",
          "version" => version
        }
      end
    end
    Unavailable = Data.define(:reason, :missing) do
      def available? = false
    end

    def self.call(raw)
      percentage = exact_integer(raw[:percentage_basis_points])
      fixed = exact_integer(raw[:fixed_cents])
      missing = []
      missing << "fee.percentage_basis_points" unless percentage&.between?(0, 9_999)
      missing << "fee.fixed_cents" unless fixed && fixed >= 0
      missing << "fee.version" if raw[:version].blank?
      return Unavailable.new(reason: "fee_configuration_missing", missing: missing) if missing.any?

      Available.new(percentage_basis_points: percentage, fixed_cents: fixed, version: raw[:version])
    end

    def self.exact_integer(value)
      return value if value.is_a?(Integer)
      return unless value.is_a?(String) && value.match?(/\A\d+\z/)

      value.to_i
    end
    private_class_method :exact_integer
  end
end
