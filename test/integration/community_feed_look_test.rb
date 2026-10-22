require "test_helper"

# STEP 41 §3.2: the community feed on the foundations. Its surfaces are cards
# with body (.card3), its tabs the reference's segmented control, its buttons
# .btn3 and its field .input3, and every colour is a token: the old surfaces
# carried rgba() fallbacks of the cream palette inside their var()s.
class CommunityFeedLookTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_test_user(email_verified_at: Time.current, locale: "es")
    LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    CommunityEngine::Post.create!(user: @user, body: "Hoy terminé el módulo de saludos.")
    sign_in_as(@user)
  end

  test "the composer, the posts and the side boxes are cards with body" do
    get community_engine.feed_path

    assert_response :success
    assert_select "h1.page-title", text: I18n.t("community_engine.feed.title", locale: :es)
    assert_select "#post_form_container.card3"
    assert_select "[id^='post_'].feed-card.card3", minimum: 1
    assert_select ".community-sidebar .card3", minimum: 2
    assert_select "#post_form_container textarea.input3"
    assert_select "#post_form_container [type='submit'].btn3"
  end

  test "the tabs are the segmented control, the current one marked" do
    get community_engine.feed_path

    assert_select ".seg a", 3
    assert_select ".seg a[aria-current='page']", 1, text: I18n.t("community_engine.feed.tabs.all", locale: :es)
  end

  test "the feed's markup carries no literal colour" do
    get community_engine.feed_path

    main = css_select("main").first.to_html
    assert_no_match(/rgba?\(/, main)
    assert_no_match(/:\s*#\h{3,8}\b/, main, "a hex colour in a style")
  end
end
