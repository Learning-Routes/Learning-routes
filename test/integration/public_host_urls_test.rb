require "test_helper"

# STEP 36 §1: everything a crawler reads names the one public host.
class PublicHostUrlsTest < ActionDispatch::IntegrationTest
  ORIGIN = "https://learningroutes.com".freeze

  test "the landing's canonical, share tags and JSON-LD use the public host" do
    get root_path

    assert_select "link[rel=canonical][href=?]", "#{ORIGIN}/"
    assert_select "meta[property='og:url'][content=?]", "#{ORIGIN}/"
    assert_select "meta[property='og:image'][content^=?]", "#{ORIGIN}/assets/og/og-en-"
    assert_select "meta[name='twitter:image'][content^=?]", "#{ORIGIN}/assets/og/og-en-"
    urls = css_select("script[type='application/ld+json']").map { |s| JSON.parse(s.text)["url"] }
    assert urls.all? { |u| u.start_with?(ORIGIN) }, urls.inspect
  end

  test "robots.txt points at the sitemap on the public host and keeps private areas out" do
    get "/robots.txt"

    assert_response :success
    assert_equal "text/plain", response.media_type
    assert_includes response.body.lines.map(&:strip), "Sitemap: #{ORIGIN}/sitemap.xml"
    assert_includes response.body, "Disallow: /profile"
  end

  # STEP 36 §2: every public page in both languages, each naming its siblings.
  test "every sitemap <loc> is on the public host, in both languages, with its alternates" do
    get "/sitemap.xml"

    assert_response :success
    assert_equal "application/xml", response.media_type
    doc = Nokogiri::XML(response.body).remove_namespaces!
    locs = doc.xpath("//url/loc").map(&:text)
    expected = %w[/ /sign_in /sign_up /privacy /terms].flat_map do |p|
      %w[es en].map { |l| "#{ORIGIN}/#{l}#{p.delete_suffix("/")}" }
    end
    assert_equal expected, locs
    doc.xpath("//url").each do |url|
      alternates = url.xpath("link[@rel='alternate']").to_h { |l| [l["hreflang"], l["href"]] }
      assert_equal %w[en es x-default], alternates.keys.sort, url.to_s
      assert alternates.values.all? { |h| h.start_with?(ORIGIN) }
    end
    lastmods = Nokogiri::XML(response.body).remove_namespaces!.xpath("//url/lastmod").map(&:text)
    assert_equal locs.size, lastmods.size
    lastmods.each { |d| assert_match(/\A\d{4}-\d{2}-\d{2}\z/, d) }
  end
end
