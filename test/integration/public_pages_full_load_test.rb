require "test_helper"

# Clarity runs on the public pages only and follows Turbo visits on its own, so
# every way out of a public page into the app must be a full page load: the new
# page then starts without it. The public pages are the one list page_area uses.
class PublicPagesFullLoadTest < ActionDispatch::IntegrationTest
  PUBLIC_PATHS = %w[/ /terms /privacy /sign_in /sign_up].freeze

  # The controller#action a same-host path lands on; nil when no route (or a
  # redirect route) answers it, which is the app too.
  def target(path, method)
    route = Rails.application.routes.recognize_path(path, method: method)
    "#{route[:controller]}##{route[:action]}"
  rescue ActionController::RoutingError
    nil
  end

  def app_bound(element, href, method)
    return false unless href&.start_with?("/") && !href.start_with?("//")
    !Core::ApplicationController::PUBLIC_PAGES.include?(target(href.split(/[?#]/).first.presence || "/", method))
  end

  def offenders
    doc = Nokogiri::HTML(response.body)
    links = doc.css("a[href]").select { |a| app_bound(a, a["href"], :get) }
    forms = doc.css("form[action]").select do |f|
      method = (f.at("input[name=_method]")&.[]("value") || f["method"] || "get").downcase.to_sym
      app_bound(f, f["action"], method)
    end
    (links + forms).reject { |e| e["data-turbo"] == "false" }.map { |e| e.to_s[0, 160] }
  end

  test "the list covers exactly the public pages" do
    PUBLIC_PATHS.each { |p| assert_includes Core::ApplicationController::PUBLIC_PAGES, target(p, :get), p }
  end

  test "signed out, every link and form from a public page into the app is a full load" do
    PUBLIC_PATHS.each do |path|
      get path
      assert_response :success
      assert_empty offenders, "#{path} leads into the app with a Turbo visit"
    end
  end

  test "signed in as a student, every link and form from a public page into the app is a full load" do
    student = create_test_user(email_verified_at: Time.current)
    post core.sign_in_path, params: { email: student.email, password: "password123" }
    %w[/ /terms /privacy].each do |path|
      get path
      assert_response :success
      assert_empty offenders, "#{path} leads into the app with a Turbo visit"
    end
  end
end
