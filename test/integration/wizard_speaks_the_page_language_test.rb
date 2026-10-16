require "test_helper"

# The owner, 14 October: the route wizard was half English on a Spanish page.
# _wizard_card.html.erb carried its copy as literals while config/locales already
# had wizard.* keys for most of it. Every visible string now comes from es/en.
class WizardSpeaksThePageLanguageTest < ActionDispatch::IntegrationTest
  VIEWS = Rails.root.glob("app/views/route_wizard/*.erb").sort

  # What the owner saw, and the rest of the card's former literals.
  ENGLISH = [
    "What do you want to learn?", "Specify your topic", "Or type something specific",
    "Language", "What is your level?", "Be honest", "Beginner", "I am just getting started",
    "What are your goals?", "Select all that apply", "Career growth", "How much time can you dedicate?",
    "We will pace your route", "Weekly hours", "Session length", "How do you learn best?",
    "Answer 12 quick questions", "Question", "All done!", "Retake quiz", "When learning something new",
    "Watch a video or diagram", "Choose your pace", "You can always change this later", "Relaxed",
    "Take it easy", "Continue", "Choose a topic", "Select your level", "Time commitment",
    "Step 1 of 6", "of 6"
  ].freeze

  test "in Spanish, no English phrase reaches the text or the accessible labels" do
    user = create_test_user(email_verified_at: Time.current, locale: "es")
    post core.sign_in_path, params: { email: user.email, password: "password123" }

    get new_route_wizard_path

    assert_response :success
    card = Nokogiri::HTML(response.body).at_css("#wizard-container")
    readable = card.xpath(".//text()").map(&:text).join(" ") + " " +
               card.xpath(".//@placeholder | .//@aria-label").map(&:value).join(" ")
    found = ENGLISH.select { |phrase| readable.include?(phrase) }
    assert_empty found, "English on the Spanish wizard: #{found.inspect}"
    assert_includes readable, I18n.t("wizard.step0.heading", locale: :es)
    assert_match(/Paso\s+1\s+de 6/, readable)
    assert_select "[data-route-wizard-target='stepCounter'] span[data-route-wizard-target='stepNum']", text: "1"
    # The counter the controller updates survives the move into a translated sentence.
    assert_select "p", text: /Pregunta\s+1\s+de 12/ do
      assert_select "span[data-route-wizard-target='styleQuestionNum']", text: "1"
    end
  end

  test "in Spanish, the generating, completed and failed states carry no English either" do
    user = create_test_user(email_verified_at: Time.current, locale: "es")
    request = RouteRequest.create!(user: user, topics: ["music"], level: "beginner", pace: "relaxed",
                                   goals: ["personal"], status: "pending")
    post core.sign_in_path, params: { email: user.email, password: "password123" }

    get new_route_wizard_path # an active request shows the generating state
    pages = { "generating" => response.body }
    I18n.with_locale(:es) do
      %w[completed generation_failed].each do |state|
        pages[state] = ApplicationController.render(partial: "route_wizard/#{state}", locals: { route_request: request })
      end
    end

    pages.each do |state, html|
      doc = Nokogiri::HTML(html)
      doc.css("style, script").each(&:remove)
      readable = doc.xpath("//body//text()").map(&:text).join(" ") + " " +
                 doc.xpath("//@placeholder | //@aria-label").map(&:value).join(" ")
      found = ENGLISH.select { |phrase| readable.include?(phrase) }
      assert_empty found, "English in the Spanish #{state} state: #{found.inspect}"
      assert_no_match(/translation missing/i, html, state)
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

  test "no route_wizard template has a literal text node or label: every string goes through t()" do
    literals = VIEWS.flat_map do |view|
      # Drop ERB tags first; what is left is the markup a translator cannot reach.
      doc = Nokogiri::HTML::DocumentFragment.parse(view.read.gsub(/<%.*?%>/m, ""))
      doc.css("style, script").each(&:remove)
      found = doc.xpath(".//text()").map { |n| n.text.strip }.grep(/[[:alpha:]]{2,}/) +
              doc.xpath(".//@placeholder | .//@aria-label | .//@title | .//@alt").map(&:value).grep(/[[:alpha:]]{2,}/)
      found.map { |text| "#{view.relative_path_from(Rails.root)}: #{text}" }
    end

    assert_empty literals, "literal copy in route_wizard templates:\n#{literals.join("\n")}"
  end
end
