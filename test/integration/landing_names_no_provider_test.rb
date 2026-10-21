require "test_helper"

# STEP 41 §2: the landing that listed its AI providers is gone, and with it PR 1's
# check that each one named was routable. What stays true is simpler: the
# landing names no AI provider, in either locale.
class LandingNamesNoProviderTest < ActionDispatch::IntegrationTest
  PROVIDERS = /\b(OpenAI|GPT|ChatGPT|ElevenLabs|Claude|Anthropic|Gemini|Mistral|Llama)\b/

  %w[es en].each do |locale|
    test "the #{locale} landing names no AI provider" do
      cookies[:locale] = locale
      get root_path

      assert_response :success
      assert_no_match PROVIDERS, response.body
    end
  end
end
