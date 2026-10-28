require "test_helper"

# STEP 46 §1. The new platform lives in platform/ with its own toolchain. The Rails
# image copies the whole repository (Dockerfile: COPY . .), and Tailwind scans every
# file under the project root it is not told to skip, so both must leave it out.
class PlatformStaysOutOfRailsTest < ActiveSupport::TestCase
  test "the Docker build context leaves out platform/" do
    patterns = Rails.root.join(".dockerignore").readlines(chomp: true).map(&:strip)

    assert_includes patterns, "/platform"
  end

  test "Tailwind does not scan platform/ for class names" do
    css = Rails.root.join("app/assets/tailwind/application.css").read

    assert css.include?('@source not "../../../platform";'),
      "application.css must tell Tailwind to skip platform/"
  end
end
