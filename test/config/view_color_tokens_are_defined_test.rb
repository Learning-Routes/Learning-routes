require "test_helper"

# A var(--color-…) the stylesheet does not define renders as nothing at all
# (or as its fallback in light only): the tutor chat's error badge and text used
# --color-error, which never existed, and the "content failed" pages used
# --color-text-primary/secondary (STEP 38 §3). Every token a view names must be
# defined in a stylesheet.
class ViewColorTokensAreDefinedTest < ActiveSupport::TestCase
  # Names built in ERB (`var(--color-node-<%= level %>)`) are checked by prefix:
  # at least one token with that prefix must exist.
  INTERPOLATED_PREFIXES = %w[--color-node- --color-badge-].freeze

  test "every var(--color-…) in a view is defined in a stylesheet" do
    missing = Rails.root.glob("{app,engines/*/app}/views/**/*.erb").flat_map do |path|
      file = path.relative_path_from(Rails.root).to_s
      # ERB comments may quote old code; blank them but keep the line count.
      source = path.read.gsub(/<%#.*?%>/m) { |comment| "\n" * comment.count("\n") }
      source.each_line.with_index(1).flat_map do |line, n|
        line.scan(/var\((--color-[a-z0-9-]*)(<%)?/).filter_map do |name, interpolated|
          known = interpolated ? prefix_defined?(name) : defined_tokens.include?(name)
          "#{file}:#{n} #{name}#{"…" if interpolated}" unless known
        end
      end
    end

    assert_empty missing, "undefined colour token(s) in views:\n#{missing.join("\n")}"
  end

  private

  def prefix_defined?(prefix)
    INTERPOLATED_PREFIXES.include?(prefix) && defined_tokens.any? { |token| token.start_with?(prefix) }
  end

  def defined_tokens
    @defined_tokens ||= Rails.root.glob("{app,engines/*/app}/assets/**/*.css")
                             .flat_map { |css| css.read.scan(/(--color-[a-z0-9-]+)\s*:/).flatten }.to_set
  end
end
