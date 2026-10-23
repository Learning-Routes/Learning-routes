require "test_helper"

# STEP 36 §2–§3: a URL per language. The locale used to live only in a cookie, so
# /, /?locale=es and every public page served one (English) version to a crawler.
class LocaleUrlsTest < ActionDispatch::IntegrationTest
  ORIGIN = "https://learningroutes.com".freeze
  PAGES = { "" => "/", "terms" => "/terms", "privacy" => "/privacy", "sign_in" => "/sign_in", "sign_up" => "/sign_up" }.freeze

  def self.localized(locale, slug) = slug.empty? ? "/#{locale}" : "/#{locale}/#{slug}"
  def localized(...) = self.class.localized(...)

  PAGES.each do |slug, bare|
    %w[es en].each do |locale|
      test "#{localized(locale, slug)} renders #{locale}, is its own canonical and names its siblings" do
        get localized(locale, slug)

        assert_response :success
        assert_select "html[lang=?]", locale
        assert_select "link[rel=canonical]", 1
        assert_select "link[rel=canonical][href=?]", ORIGIN + localized(locale, slug)
        assert_select "link[rel=alternate][hreflang=es][href=?]", ORIGIN + localized("es", slug)
        assert_select "link[rel=alternate][hreflang=en][href=?]", ORIGIN + localized("en", slug)
        assert_select "link[rel=alternate][hreflang=x-default][href=?]", ORIGIN + bare
        assert_select "meta[property='og:url'][content=?]", ORIGIN + localized(locale, slug)
      end

      test "#{localized(locale, slug)} has a branded title and description within Google's lengths" do
        get localized(locale, slug)

        title = css_select("title").first.text
        description = css_select("meta[name=description]").first&.[]("content")
        assert_includes title, "Learning Routes"
        assert_operator title.length, :<=, 60, "title too long (#{title.length}): #{title}"
        assert description.present?, "no meta description on #{localized(locale, slug)}"
        assert_operator description.length, :<=, 155, "description too long (#{description.length}): #{description}"
        assert_select "h1", 1
      end
    end

    test "#{bare} without a language still answers and is the x-default" do
      get bare

      assert_response :success
      assert_select "link[rel=canonical][href=?]", ORIGIN + bare
      assert_select "link[rel=alternate][hreflang=x-default][href=?]", ORIGIN + bare
    end
  end

  test "/es renders the Spanish title and /en the English one" do
    get "/es"
    assert_select "title", I18n.t("landing.page_title", locale: :es)
    get "/en"
    assert_select "title", I18n.t("landing.page_title", locale: :en)
    refute_equal I18n.t("landing.page_title", locale: :es), I18n.t("landing.page_title", locale: :en)
  end

  test "on a public page the URL wins over the cookie" do
    cookies[:locale] = "es"
    get "/en/terms"
    assert_select "html[lang=en]"
  end

  test "the language in the URL becomes the cookie, so the forms that post without one keep it" do
    get "/es/sign_in"
    assert_equal "es", cookies[:locale]
  end

  test "a page without a language keeps reading the cookie" do
    cookies[:locale] = "es"
    get "/"
    assert_select "html[lang=es]"
  end

  test "/?locale=es, the old way to ask for Spanish, moves permanently to /es" do
    get "/?locale=es"
    assert_redirected_to "/es"
    assert_response :moved_permanently

    get "/terms?locale=en"
    assert_redirected_to "/en/terms"
  end

  test "links on a localized page stay in its language" do
    get "/es"
    assert_select "a[href='/es/sign_in']"
    assert_select "a[href='/es/terms']"
    assert_select "a[href='/es/privacy']"
  end

  test "the language toggle on a public page is a link to the sibling URL" do
    get "/es/terms"
    assert_select "a.locale-toggle[hreflang=en][href='/en/terms']", "EN"
    assert_select "form[action='/locale']", 0
  end

  test "behind the login the toggle still posts the cookie" do
    user = create_test_user(email_verified_at: Time.current)
    post core.sign_in_path, params: { email: user.email, password: "password123" }
    get "/settings"
    assert_select "form[action='/locale']"
  end

  test "the landing's JSON-LD names the organization and the site in both languages" do
    get "/es"

    graph = css_select("script[type='application/ld+json']").map { |s| JSON.parse(s.text) }
    types = graph.index_by { |n| n["@type"] }
    assert_equal %w[Organization WebApplication WebSite], types.keys.sort
    org = types["Organization"]
    %w[name url logo sameAs].each { |k| assert org[k].present?, "Organization lacks #{k}" }
    assert org["logo"].start_with?(ORIGIN)
    assert_equal %w[en es], types["WebSite"]["inLanguage"].sort
    assert_equal "#{ORIGIN}/es", types["WebSite"]["url"]
  end

  test "each language shares its own 1200x630 card by absolute URL" do
    %w[es en].each do |locale|
      get "/#{locale}"
      image = css_select("meta[property='og:image']").first["content"]
      assert_match %r{\A#{ORIGIN}/assets/og/og-#{locale}-\h+\.png\z}, image
      assert_select "meta[name='twitter:image'][content=?]", image

      png = File.binread(Rails.root.join("app/assets/images/og/og-#{locale}.png"))
      assert_equal "\x89PNG".b, png[0, 4]
      assert_equal [1200, 630], png[16, 8].unpack("NN"), "og-#{locale}.png is not 1200x630"
    end
  end
end
