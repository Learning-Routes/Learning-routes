require "test_helper"

# Every HTML layout opens <head> and <body> with GTM's two partials, so no page
# is left out of the count (the partials themselves decide whether to render).
class GoogleTagManagerLayoutsTest < ActiveSupport::TestCase
  LAYOUTS = Dir[Rails.root.join("{app,engines/*/app}/views/layouts/**/*.html.erb")].reject { |f| f.include?("mailer") }

  test "there are layouts to check" do
    assert_operator LAYOUTS.size, :>=, 12
  end

  LAYOUTS.each do |path|
    name = path.delete_prefix("#{Rails.root}/")
    test "#{name} opens <head> and <body> with GTM" do
      html = File.read(path)
      assert_match(/<head>\s*<%= render "shared\/gtm_head" %>/, html, "#{name}: the head snippet must come first in <head>")
      assert_match(/<body.*>\n\s*<%= render "shared\/gtm_body" %>/, html, "#{name}: the noscript must come right after <body>")
    end
  end
end
