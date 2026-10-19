require "test_helper"

# macOS Chrome keeps a window at least 500 px wide, so resize_to(390, …)
# tests a phone at 390 on CI and at 500 on a Mac: one test passed locally and
# failed on CI (PR #73). Phone widths go through the CDP viewport override.
class ResizeToWidthGuardTest < ActiveSupport::TestCase
  test "no system test asks resize_to for a window narrower than 500 px" do
    narrow = Dir[Rails.root.join("test/system/**/*.rb")].flat_map do |path|
      File.readlines(path).each_with_index.filter_map do |line, i|
        next if line.lstrip.start_with?("#")
        width = line[/resize_to\(\s*(\d+)/, 1]
        "#{Pathname(path).relative_path_from(Rails.root)}:#{i + 1}" if width && width.to_i < 500
      end
    end

    assert_empty narrow, "resize_to under 500 px (use the CDP viewport override): #{narrow.join(', ')}"
  end
end
