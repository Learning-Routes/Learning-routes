require "test_helper"

# STEP 36 §1. The landing's canonical, og:url, og:image, JSON-LD url, robots'
# Sitemap: and every sitemap <loc> named learning-routes.com, a domain with no
# DNS; Google read "the real page lives at an address that does not exist" and
# ignored the declared canonical. The public host now comes from one setting
# (config.x.public_host); this sweep keeps the dead name from coming back.
class OnePublicHostTest < ActiveSupport::TestCase
  OLD_HOST = "learning-routes.com".freeze
  SWEPT = %w[app/views app/helpers config/locales public config/initializers].freeze

  # Where the old name legitimately stays while the owner decides its fate
  # (STEP 36 §Owner 3): the server still answers it, so its websocket origin must
  # be allowed. Empties when learning-routes.com is either redirected or dropped.
  ALLOWED = {
    "config/initializers/content_security_policy.rb" => "wss://learning-routes.com"
  }.freeze

  test "no swept file names the old host outside a comment" do
    offenders = SWEPT.flat_map { |dir| Rails.root.glob("#{dir}/**/*").select(&:file?) }.flat_map do |path|
      rel = path.relative_path_from(Rails.root).to_s
      path.read.each_line.with_index(1).filter_map do |line, n|
        next unless line.include?(OLD_HOST)
        next if line.lstrip.start_with?("#", "<%#")
        next if ALLOWED[rel] && line.include?(ALLOWED[rel])
        "#{rel}:#{n}: #{line.strip}"
      end
    rescue ArgumentError # binary file (images)
      []
    end

    assert_empty offenders, "the old host is back:\n#{offenders.join("\n")}"
  end

  test "every allow-listed line still exists, so the list cannot outlive its reason" do
    ALLOWED.each do |rel, needle|
      assert_includes Rails.root.join(rel).read, needle, "#{rel} no longer needs its allow-list entry"
    end
  end
end
