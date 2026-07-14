# Code coverage — opt-in via COVERAGE=1 so it never interferes with normal runs
# or the parallel test forks. `COVERAGE=1 bin/rails test` writes coverage/.
if ENV["COVERAGE"]
  require "simplecov"
  SimpleCov.start "rails" do
    add_group "Core",            "engines/core"
    add_group "Learning Routes", "engines/learning_routes_engine"
    add_group "Content Engine",  "engines/content_engine"
    add_group "AI Orchestrator", "engines/ai_orchestrator"
    add_group "Assessments",     "engines/assessments"
    add_group "Analytics",       "engines/analytics"
    add_group "Community",       "engines/community_engine"
    add_group "Main App",        ["app/", "lib/"]

    add_filter "/test/"
    add_filter "/config/"
    add_filter "/vendor/"
    add_filter "/db/"
    enable_coverage :branch
  end
end

ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"
require "webmock/minitest"

# Tests must never hit the network — external APIs (OpenAI, ElevenLabs, Tavily)
# are stubbed. Localhost stays open for the DB / Solid Queue / Capybara.
WebMock.disable_net_connect!(allow_localhost: true)

# With a real (memory) cache store, Rack::Attack's throttle counters persist,
# so repeated sign-ins across integration tests would trip the login rate limit
# and break auth-dependent tests. Disable it globally in tests; the dedicated
# rack_attack_test re-enables it per-test.
Rack::Attack.enabled = false if defined?(Rack::Attack)

module ActiveSupport
  class TestCase
    # Run tests serially on arm64-darwin — the pg gem (1.6.x) segfaults when
    # the parallel runner forks worker processes that already loaded libpq.
    # Same root cause as the Solid Queue arm64 fork crash documented in
    # config/environments/development.rb. Stay parallel everywhere else.
    if RUBY_PLATFORM.include?("arm64-darwin")
      parallelize(workers: 1)
    else
      parallelize(workers: :number_of_processors)
    end

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    # ─── Shared helpers ──────────────────────────────────────────────

    # Create a persisted test user with a unique email (no fixtures needed).
    def create_test_user(attrs = {})
      Core::User.create!({
        name: Faker::Name.name,
        email: Faker::Internet.unique.email,
        password: "password123",
        role: :student
      }.merge(attrs))
    end

    # ─── External-API stubs (WebMock) ────────────────────────────────

    def stub_openai_chat(response_body:, model: "gpt-4.1-mini")
      stub_request(:post, "https://api.openai.com/v1/chat/completions")
        .to_return(
          status: 200,
          body: {
            id: "chatcmpl-test", object: "chat.completion", model: model,
            choices: [{ index: 0, message: { role: "assistant", content: response_body }, finish_reason: "stop" }],
            usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 }
          }.to_json,
          headers: { "Content-Type" => "application/json" }
        )
    end

    def stub_elevenlabs_tts(audio_data: "fake-audio-data")
      stub_request(:post, /api\.elevenlabs\.io\/v1\/text-to-speech/)
        .to_return(status: 200, body: audio_data, headers: { "Content-Type" => "audio/mpeg" })
    end

    def stub_openai_image(url: "https://example.com/generated-image.png")
      stub_request(:post, "https://api.openai.com/v1/images/generations")
        .to_return(status: 200, body: { data: [{ url: url }] }.to_json, headers: { "Content-Type" => "application/json" })
    end
  end
end

# ─── Integration test helpers ────────────────────────────────────────
module ActionDispatch
  class IntegrationTest
    # Sign in via the real session endpoint (params[:email]/[:password]).
    def sign_in_as(user, password: "password123")
      post core.sign_in_path, params: { email: user.email, password: password }
    end

    def setup_authenticated_user
      @user = create_test_user
      sign_in_as(@user)
    end
  end
end
