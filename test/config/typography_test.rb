require "test_helper"

# STEP 41 §1.2: one typeface token, --font-sans (Archivo); no view sets
# font-family inline. Mailers keep inline styles: email clients ignore the
# stylesheet. The journey keeps WP-37b's own faces until PR 5b aligns it.
class TypographyTest < ActiveSupport::TestCase
  ARCHIVO = "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap".freeze
  LAYOUTS = %w[application auth landing learning onboarding].freeze

  test "no view or layout sets font-family inline" do
    offenders = Dir[Rails.root.join("{app,engines/*/app}/views/**/*.erb")].reject { |path| path.include?("mailer") }
      .flat_map do |path|
        File.readlines(path).each_with_index.filter_map do |line, i|
          "#{Pathname(path).relative_path_from(Rails.root)}:#{i + 1}" if line.include?("font-family")
        end
      end

    assert_empty offenders, "font-family belongs in a class (--font-sans / --font-mono): #{offenders.first(20).join(', ')}"
  end

  test "every layout loads Archivo and no longer loads DM Sans" do
    LAYOUTS.each do |layout|
      source = Rails.root.join("app/views/layouts/#{layout}.html.erb").read

      assert_includes source, ARCHIVO, "#{layout} does not load Archivo"
      refute_includes source, "DM+Sans", "#{layout} still loads DM Sans"
    end
  end

  test "--font-sans is Archivo" do
    css = Rails.root.join("app/assets/tailwind/application.css").read

    assert_match(/--font-sans:\s*"Archivo"/, css)
  end
end
