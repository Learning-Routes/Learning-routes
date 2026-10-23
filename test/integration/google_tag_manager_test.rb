require "test_helper"

# Google Tag Manager loads in production only, before anything else in <head>,
# under the request's CSP nonce, after Consent Mode's defaults, and never for
# the owner, whose own visits would count.
class GoogleTagManagerTest < ActionDispatch::IntegrationTest
  EEA_UK_CH = %w[AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH].freeze

  def with_gtm(id = "GTM-T2MH7XX4")
    previous = Rails.configuration.x.gtm_id
    Rails.configuration.x.gtm_id = id
    yield
  ensure
    Rails.configuration.x.gtm_id = previous
  end

  def csp_nonce = response.headers["Content-Security-Policy"][/'nonce-([^']+)'/, 1]

  test "production sets the container and nothing else does" do
    assert_match(/^\s*config\.x\.gtm_id = "GTM-T2MH7XX4"$/, Rails.root.join("config/environments/production.rb").read)
    assert_nil Rails.configuration.x.gtm_id
  end

  test "in test nothing of it renders" do
    get "/"
    assert_response :success
    refute_includes response.body, "googletagmanager"
    refute_includes response.body, "dataLayer"
  end

  test "with the production setting the head opens with the snippet under the request's nonce" do
    with_gtm { get "/" }

    head = Nokogiri::HTML(response.body).at("head")
    charset, first = head.element_children.first(2)
    assert_equal "utf-8", charset["charset"], "the charset must open <head>"
    assert_equal "script", first.name, "GTM must come right after the charset, found <#{first.name}>"
    assert_equal csp_nonce, first["nonce"]
    assert_includes first.text, "GTM-T2MH7XX4"
    # Google's line: copy the nonce of this very script onto gtm.js.
    assert_includes first.text, 'n && j.setAttribute("nonce", n.nonce || n.getAttribute("nonce"))', "gtm.js must carry the nonce on"
  end

  test "Consent Mode's defaults are set before GTM loads" do
    with_gtm { get "/" }

    script = Nokogiri::HTML(response.body).at("head script").text
    regional = script.index(%("consent", "default", {"ad_storage":"denied","ad_user_data":"denied","ad_personalization":"denied","analytics_storage":"denied","region":))
    global = script.index(%("consent", "default", {"ad_storage":"denied","ad_user_data":"denied","ad_personalization":"denied","analytics_storage":"granted"}))
    loader = script.index("gtm.js")
    assert regional && global && loader, script
    assert_operator regional, :<, loader
    assert_operator global, :<, loader
    region = JSON.parse(script[/"region":(\[[^\]]*\])/, 1])
    assert_equal EEA_UK_CH.sort, region.sort
  end

  test "the noscript iframe comes right after <body>" do
    with_gtm { get "/" }

    first = Nokogiri::HTML(response.body).at("body").element_children.first
    assert_equal "noscript", first.name
    assert_includes first.inner_html, "https://www.googletagmanager.com/ns.html?id=GTM-T2MH7XX4"
  end

  test "the signed-in owner's pages load nothing" do
    owner = create_test_user(email_verified_at: Time.current, role: :owner)
    post core.sign_in_path, params: { email: owner.email, password: "password123" }
    with_gtm { get "/" }
    refute_includes response.body, "googletagmanager"
  end

  test "a signed-in student's pages still load it" do
    student = create_test_user(email_verified_at: Time.current)
    post core.sign_in_path, params: { email: student.email, password: "password123" }
    with_gtm { get "/profile" }
    assert_includes response.body, "googletagmanager.com/gtm.js"
  end

  # Google's CSP guide for GTM, plus GA4, Microsoft Clarity and GTM's Preview mode:
  # exactly these hosts, nothing broader, and no unsafe-inline or unsafe-eval for scripts.
  test "the CSP gains exactly the hosts GTM, GA4, Clarity and Preview mode need" do
    get "/"
    policy = response.headers["Content-Security-Policy"].split(";").to_h { |d| d.strip.split(" ", 2) }

    assert_equal "'self' https://cdn.jsdelivr.net https://www.googletagmanager.com https://www.clarity.ms https://*.clarity.ms https://tagmanager.google.com",
      policy["script-src"].sub(/ 'nonce-[^']+'/, "")
    assert_equal "'self' data: https: https://www.googletagmanager.com https://*.google-analytics.com https://*.clarity.ms https://c.bing.com https://ssl.gstatic.com https://www.gstatic.com",
      policy["img-src"]
    assert_equal "'self' ws://localhost:3000 ws://127.0.0.1:3000 https://www.googletagmanager.com https://*.google-analytics.com https://*.google.com https://*.clarity.ms https://c.bing.com",
      policy["connect-src"]
    assert_equal "'self' https://www.googletagmanager.com", policy["frame-src"]
    assert_equal "'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://tagmanager.google.com https://www.googletagmanager.com",
      policy["style-src"]
    refute_match(/unsafe-inline|unsafe-eval/, policy["script-src"])
  end

  # The owner fires Clarity on the public pages only, so each page says which it is,
  # before GTM loads.
  def page_area
    script = Nokogiri::HTML(response.body).at("head script").text
    pushed = script.index('dataLayer.push({"page_area":')
    assert pushed, "no page_area push in #{script}"
    assert_operator pushed, :<, script.index("gtm.js"), "page_area must be pushed before GTM loads"
    script[/dataLayer\.push\(\{"page_area":"(\w+)"\}\)/, 1]
  end

  test "the landing, legal pages, sign-in and sign-up are public" do
    with_gtm do
      %w[/ /terms /privacy /sign_in /sign_up].each do |path|
        get path
        assert_equal "public", page_area, path
      end
    end
  end

  test "pages behind the login are the app" do
    student = create_test_user(email_verified_at: Time.current)
    post core.sign_in_path, params: { email: student.email, password: "password123" }
    with_gtm { get "/profile" }
    assert_equal "app", page_area
  end

  # Draft, waiting for the owner's approval: once GTM ships, the old "no third-party
  # tracking cookies" sentence would be false.
  test "the privacy page names Google Analytics and Microsoft Clarity, what they collect and their cookies, in both languages" do
    %w[es en].each do |locale|
      get "/privacy", headers: { "Cookie" => "locale=#{locale}" }
      text = Nokogiri::HTML(response.body).at("main").text
      assert_includes text, "Google Analytics"
      assert_includes text, "_ga"
      assert_includes text, "tools.google.com/dlpage/gaoptout"
      assert_includes text, "Microsoft Clarity"
      assert_includes text, "_clck"
      refute_match(/third-party tracking cookies|cookies de seguimiento de terceros/, text)
    end
  end
end
