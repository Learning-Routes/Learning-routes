require "test_helper"

# STEP 41 §3: each page PR 5b moves onto the foundations names no literal
# colour and no old-palette token, in its views, the controllers that paint it
# and its block of application.css. The lesson has its own, longer sweep
# (lesson_palette_test.rb); token definitions (`--x: …`) are not sweeps' business.
class PagePaletteTest < ActiveSupport::TestCase
  LITERAL = /rgba?\(\s*\d|#(?:\h{8}|\h{6})\b|#\h{3}\b(?![\w-])|\b(?:bg|text|ring|accent|border|from|to|fill|stroke)-(?:indigo|violet|purple|blue|green|emerald|amber|orange|red|gray|slate|yellow|pink|rose)-\d{2,3}\b/
  OLD_TOKENS = /--color-(?:dark(?:-[a-z]+)?|highlight-violet|step-progress-(?:bg|icon)|tint(?:-strong|-hover)?)\b/
  CSS = Rails.root.join("app/assets/tailwind/application.css").read.gsub(%r{/\*.*?\*/}m) { |c| c.gsub(/[^\n]/, " ") }

  PAGES = {
    "wizard" => {
      files: ["app/views/route_wizard/*.erb", "app/javascript/controllers/route_wizard_controller.js"],
      css: [/ROUTE WIZARD/, /WP-37 journey map/]
    },
    "settings" => { files: ["app/views/settings/*.erb", "app/javascript/controllers/auth_form_controller.js"] },
    # The Google mark keeps Google's colours (core/shared/_google_logo.html.erb).
    "sign in and sign up" => {
      files: ["app/views/layouts/auth.html.erb", "engines/core/app/views/core/{sessions,registrations,passwords,email_verifications}/*.erb",
              "app/javascript/controllers/auth_background_controller.js"]
    },
    "shared route" => {
      files: ["engines/community_engine/app/views/community_engine/{shared_routes,comments,likes,ratings,follows}/*.erb"]
    },
    "exam" => {
      files: ["engines/assessments/app/views/assessments/**/*.erb",
              "app/javascript/controllers/{question_nav,exam_timer,voice_recorder}_controller.js"]
    },
    "notifications" => {
      files: ["engines/community_engine/app/views/community_engine/notifications/*.erb",
              "app/javascript/controllers/notifications_controller.js"]
    }
  }.freeze

  PAGES.each do |page, spec|
    test "#{page}: no literal colour and no old-palette token" do
      offenders = spec[:files].flat_map { |g| Dir[Rails.root.join(g)] }.sort.flat_map do |path|
        File.readlines(path).each_with_index.filter_map do |line, i|
          next if line.strip.start_with?("--")
          next unless line.match?(LITERAL) || line.match?(OLD_TOKENS)

          "#{Pathname(path).relative_path_from(Rails.root)}:#{i + 1}: #{line.strip[0, 110]}"
        end
      end
      if spec[:css]
        from, to = spec[:css]
        raw = Rails.root.join("app/assets/tailwind/application.css").read
        start = raw.index(from) or flunk("no #{from.inspect} in application.css")
        block = CSS[start...(raw.index(to, start) || raw.size)]
        offenders += block.scan(/([^{}]+)\{([^{}]*)\}/).flat_map do |selector, body|
          body.split(";").map(&:strip).reject { |d| d.start_with?("--") }
              .select { |d| d.match?(LITERAL) || d.match?(OLD_TOKENS) }.map { |d| "css #{selector.strip}: #{d}" }
        end
      end
      assert_empty offenders, "#{offenders.size} literal or old-palette colours:\n#{offenders.first(40).join("\n")}"
    end
  end
end
