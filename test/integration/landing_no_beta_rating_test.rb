require "test_helper"

# Owner, 19 October: there is no data behind "4.8 satisfaction in private
# beta". The landing claims no rating, in words or in stars, in either locale.
class LandingNoBetaRatingTest < ActionDispatch::IntegrationTest
  STAR = "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z".freeze

  { "es" => "beta privada", "en" => "private beta" }.each do |locale, phrase|
    test "the #{locale} landing shows no beta rating and no stars" do
      cookies[:locale] = locale
      get root_path

      assert_response :success
      assert_includes response.body, ERB::Util.html_escape(I18n.t("hero.cta", locale: locale))
      refute_includes response.body, "4.8"
      refute_match(/#{phrase}/i, response.body)
      refute_match(/satisf/i, response.body)
      refute_includes response.body, STAR
    end
  end
end
