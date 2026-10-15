require "test_helper"

# STEP 38 §3. Every colour a page shows comes from the token set in
# app/assets/tailwind/application.css (--color-*), which has a dark value for
# each. A literal hex in a view is the same colour in both themes, and that is
# how the dark theme got "colores y paletas que no están bien".
class NoLiteralColorsInViewsTest < ActiveSupport::TestCase
  HEX = /#(?:\h{6}|\h{3})\b/
  # Mail clients do not support CSS custom properties: a mailer keeps its literals.
  MAILER = %r{(_mailer/|layouts/mailer)}
  # The web app manifest is JSON the OS reads; it has no CSS.
  MANIFEST = "app/views/pwa/manifest.json.erb"

  # Literals the owner has not yet ruled on (STEP 38 §3: "ask the owner before
  # changing any colour he did not mention"). Per file, the count may only fall;
  # the list empties when his answer lands.
  PENDING = YAML.load_file(Rails.root.join("test/config/literal_colors_pending.yml")).freeze

  test "no view carries a literal hex colour beyond the list waiting for the owner" do
    found = literal_counts
    over = found.filter_map do |file, count|
      allowed = PENDING.fetch(file, 0)
      "#{file}: #{count} literal(s), #{allowed} pending" if count > allowed
    end

    assert_empty over, "a literal hex colour in a view; use a --color-* token:\n#{over.join("\n")}"
  end

  test "the pending list only shrinks: it records no more than is left" do
    found = literal_counts
    stale = PENDING.filter_map do |file, allowed|
      "#{file}: #{allowed} pending, #{found.fetch(file, 0)} left" if found.fetch(file, 0) < allowed
    end

    assert_empty stale, "lower these counts in test/config/literal_colors_pending.yml:\n#{stale.join("\n")}"
  end

  private

  def literal_counts
    Rails.root.glob("{app,engines/*/app}/views/**/*.erb").each_with_object({}) do |path, counts|
      file = path.relative_path_from(Rails.root).to_s
      next if file.match?(MAILER) || file == MANIFEST

      count = path.read.gsub(/&#x?\h+;/, "").scan(HEX).size
      counts[file] = count if count.positive?
    end
  end
end
