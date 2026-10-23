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
    first = head.element_children.first
    assert_equal "script", first.name, "GTM must be the first thing in <head>, found <#{first.name}>"
    assert_equal csp_nonce, first["nonce"]
    assert_includes first.text, "GTM-T2MH7XX4"
    assert_includes first.text, %(setAttribute("nonce", "#{csp_nonce}")), "gtm.js must carry the nonce on"
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

  test "the CSP gains exactly GTM's and GA4's hosts, and no unsafe-inline for scripts" do
    get "/"
    policy = response.headers["Content-Security-Policy"].split(";").to_h { |d| d.strip.split(" ", 2) }

    assert_equal "'self' https://cdn.jsdelivr.net https://www.googletagmanager.com", policy["script-src"].sub(/ 'nonce-[^']+'/, "")
    assert_equal "'self' ws://localhost:3000 ws://127.0.0.1:3000 https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com", policy["connect-src"]
    assert_equal "'self' https://www.googletagmanager.com", policy["frame-src"]
    # img-src already allows any https: image, which covers GA4's pixels; it is not widened.
    assert_equal "'self' data: https:", policy["img-src"]
    refute_includes policy["script-src"], "unsafe-inline"
  end
end
