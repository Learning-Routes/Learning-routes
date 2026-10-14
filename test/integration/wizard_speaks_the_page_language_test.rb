require "test_helper"

# The owner, 14 October: the route wizard was half English on a Spanish page.
# _wizard_card.html.erb carried its copy as literals while config/locales already
# had wizard.* keys for most of it. Every visible string now comes from es/en.
class WizardSpeaksThePageLanguageTest < ActionDispatch::IntegrationTest
  VIEW = Rails.root.join("app/views/route_wizard/_wizard_card.html.erb")

  # What the owner saw, and the rest of the card's former literals.
  ENGLISH = [
    "What do you want to learn?", "Specify your topic", "Or type something specific",
    "Language", "What is your level?", "Be honest", "Beginner", "I am just getting started",
    "What are your goals?", "Select all that apply", "Career growth", "How much time can you dedicate?",
    "We will pace your route", "Weekly hours", "Session length", "How do you learn best?",
    "Answer 12 quick questions", "Question", "All done!", "Retake quiz", "When learning something new",
    "Watch a video or diagram", "Choose your pace", "You can always change this later", "Relaxed",
    "Take it easy", "Continue", "Choose a topic", "Select your level", "Time commitment"
  ].freeze

  test "in Spanish, no English phrase reaches the text or the accessible labels" do
    user = create_test_user(email_verified_at: Time.current, locale: "es")
    post core.sign_in_path, params: { email: user.email, password: "password123" }

    get new_route_wizard_path

    assert_response :success
    card = Nokogiri::HTML(response.body).at_css("form[action='#{create_route_wizard_path}']").parent
    readable = card.xpath(".//text()").map(&:text).join(" ") + " " +
               card.xpath(".//@placeholder | .//@aria-label").map(&:value).join(" ")
    found = ENGLISH.select { |phrase| readable.include?(phrase) }
    assert_empty found, "English on the Spanish wizard: #{found.inspect}"
    assert_includes readable, I18n.t("wizard.step0.heading", locale: :es)
    # The counter the controller updates survives the move into a translated sentence.
    assert_select "p", text: /Pregunta\s+1\s+de 12/ do
      assert_select "span[data-route-wizard-target='styleQuestionNum']", text: "1"
    end
  end

  test "both locales render the whole card, with no missing translation" do
    %w[es en].each do |locale|
      user = create_test_user(email_verified_at: Time.current, locale: locale)
      post core.sign_in_path, params: { email: user.email, password: "password123" }

      get new_route_wizard_path

      assert_response :success
      assert_no_match(/translation missing|translation_missing/i, response.body, locale)
      assert_includes response.body, ERB::Util.html_escape(I18n.t("wizard.step4.questions.q12.scenario", locale: locale))
      delete core.sign_out_path
    end
  end

  test "the card's template has no literal text node or label: every string goes through t()" do
    # Drop ERB tags first; what is left is the markup a translator cannot reach.
    markup = VIEW.read.gsub(/<%.*?%>/m, "")
    doc = Nokogiri::HTML::DocumentFragment.parse(markup)
    literals = doc.xpath(".//text()").map { |n| n.text.strip }.grep(/[[:alpha:]]{2,}/) +
               doc.xpath(".//@placeholder | .//@aria-label | .//@title | .//@alt").map(&:value).grep(/[[:alpha:]]{2,}/)

    assert_empty literals, "literal copy in #{VIEW.relative_path_from(Rails.root)}: #{literals.inspect}"
  end
end
