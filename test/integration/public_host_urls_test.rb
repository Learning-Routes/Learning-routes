require "test_helper"

# STEP 36 §1: everything a crawler reads names the one public host.
class PublicHostUrlsTest < ActionDispatch::IntegrationTest
  ORIGIN = "https://learningroutes.com".freeze

  test "the landing's canonical, share tags and JSON-LD use the public host" do
    get root_path

    assert_select "link[rel=canonical][href=?]", "#{ORIGIN}/"
    assert_select "meta[property='og:url'][content=?]", "#{ORIGIN}/"
    assert_select "meta[property='og:image'][content=?]", "#{ORIGIN}/apple-touch-icon.png"
    assert_select "meta[name='twitter:image'][content=?]", "#{ORIGIN}/apple-touch-icon.png"
    json_ld = JSON.parse(css_select("script[type='application/ld+json']").first.text)
    assert_equal "#{ORIGIN}/", json_ld["url"]
  end

  test "robots.txt points at the sitemap on the public host and keeps private areas out" do
    get "/robots.txt"

    assert_response :success
    assert_equal "text/plain", response.media_type
    assert_includes response.body.lines.map(&:strip), "Sitemap: #{ORIGIN}/sitemap.xml"
    assert_includes response.body, "Disallow: /profile"
  end

  test "every sitemap <loc> is on the public host, and the legal pages are listed" do
    get "/sitemap.xml"

    assert_response :success
    assert_equal "application/xml", response.media_type
    locs = Nokogiri::XML(response.body).remove_namespaces!.xpath("//url/loc").map(&:text)
    assert_equal %w[/ /sign_in /sign_up /privacy /terms].map { |p| "#{ORIGIN}#{p}" }, locs
    lastmods = Nokogiri::XML(response.body).remove_namespaces!.xpath("//url/lastmod").map(&:text)
    assert_equal locs.size, lastmods.size
    lastmods.each { |d| assert_match(/\A\d{4}-\d{2}-\d{2}\z/, d) }
  end
end
