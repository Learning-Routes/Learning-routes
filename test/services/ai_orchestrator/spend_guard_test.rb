require "test_helper"

module AiOrchestrator
  # THE CLASS: no paid provider is reachable without the spend guard.
  #
  # Before this, `check_cost_limit!` and `check_rate_limit!` lived inside
  # `ModelRouter#execute`, which only 2 of the 8 AiClient construction sites go
  # through. Both TTS paths built an AiClient directly, so the 5,000¢/day
  # ceiling, the 500¢ per-user/day ceiling and the 20 rpm ElevenLabs limit were
  # never consulted for ANY audio. CostAlertJob runs hourly and only reports
  # after the money is gone.
  #
  # The guard now sits at `AiClient#chat`. `chat` is AiClient's only public
  # instance method, which is what reduces "every construction site is guarded"
  # from an enumeration that rots to a property this test can hold: construction
  # alone cannot reach a provider, and the one method that can, asks first.
  class SpendGuardTest < ActiveSupport::TestCase
    def setup
      SpendGuard.reset_rate_limits!
      @original_alerts = Rails.application.config.ai_cost_alerts
    end

    def teardown
      Rails.application.config.ai_cost_alerts = @original_alerts
      SpendGuard.reset_rate_limits!
    end

    # SpendGuard.call is a class method, so a singleton swap counts invocations
    # without touching the behaviour under test.
    def count_guard_calls
      calls = 0
      original = SpendGuard.method(:call)
      SpendGuard.define_singleton_method(:call) do |**kwargs|
        calls += 1
        original.call(**kwargs)
      end
      begin
        yield
      ensure
        SpendGuard.define_singleton_method(:call, original)
      end
      calls
    end

    def with_counting_cache
      original = Rails.cache
      Rails.cache = ActiveSupport::Cache::MemoryStore.new
      yield
    ensure
      Rails.cache = original
    end

    def refuse_everything!
      Rails.application.config.ai_cost_alerts = @original_alerts.merge(daily_limit: 0)
    end

    # ── the class ───────────────────────────────────────────────────────────

    test "chat is the only public entry point on AiClient" do
      assert_equal [:chat], AiClient.public_instance_methods(false).sort,
        "a second public method that reaches a provider would bypass the guard; " \
        "route it through chat or give it the same guard"
    end

    test "every AiClient construction site in the codebase reaches a provider only through chat" do
      sites = Dir[Rails.root.join("{app,engines/*/app,lib}/**/*.rb")]
        .reject { |path| path.include?("/ai_client.rb") }
        .select { |path| File.read(path).include?("AiClient.new") }

      assert_operator sites.size, :>=, 8, "the sweep found fewer sites than exist; check the glob"

      sites.each do |path|
        source = File.read(path)
        # Every construction is immediately followed by a `.chat` call on the
        # client — nothing reaches a provider any other way.
        assert_match(/\.chat\(/, source,
          "#{Pathname.new(path).relative_path_from(Rails.root)} builds an AiClient but never calls chat; " \
          "if it reaches a provider another way it is unguarded")
      end
    end

    # ── the defect: all voice spend bypassed the ceiling ────────────────────

    test "an ElevenLabs call is refused when the daily ceiling is reached" do
      stub_elevenlabs_tts
      refuse_everything!

      error = assert_raises(SpendGuard::LimitExceeded) do
        AiClient.new(model: "elevenlabs", task_type: :voice_narration).chat(prompt: "hola")
      end

      assert_equal :daily_budget, error.kind
      assert_not_requested :post, /api\.elevenlabs\.io/
    end

    test "an image call is refused when the daily ceiling is reached" do
      stub_openai_image
      refuse_everything!

      assert_raises(SpendGuard::LimitExceeded) do
        AiClient.new(model: "gpt-image-1", task_type: :image_generation).chat(prompt: "a cat")
      end

      assert_not_requested :post, "https://api.openai.com/v1/images/generations"
    end

    test "a text call is refused when the daily ceiling is reached" do
      stub_openai_chat(response_body: "hi")
      refuse_everything!

      assert_raises(SpendGuard::LimitExceeded) do
        AiClient.new(model: "gpt-4.1-mini", task_type: :lesson_content).chat(prompt: "hi")
      end

      assert_not_requested :post, "https://api.openai.com/v1/chat/completions"
    end

    test "the per-user ceiling refuses a call the global ceiling would allow" do
      user = create_test_user
      Rails.application.config.ai_cost_alerts = @original_alerts.merge(per_user_daily: 0)
      stub_elevenlabs_tts

      error = assert_raises(SpendGuard::LimitExceeded) do
        AiClient.new(model: "elevenlabs", task_type: :voice_narration, user: user).chat(prompt: "hola")
      end

      assert_equal :user_budget, error.kind
    end

    # The test environment runs :null_store, where counters never persist, so the
    # limiter needs a real store to be exercised at all.
    test "the ElevenLabs rate limit is now consulted for audio" do
      with_counting_cache do
        limit = ModelRouter::RATE_LIMITS.fetch("elevenlabs")
        limit.times { SpendGuard.call(model: "elevenlabs", task_type: :voice_narration) }

        error = assert_raises(SpendGuard::LimitExceeded) do
          SpendGuard.call(model: "elevenlabs", task_type: :voice_narration)
        end

        assert_equal :rate_limit, error.kind
      end
    end

    # ── no double counting ──────────────────────────────────────────────────

    # "Checked once" is asserted as its two halves, because a single end-to-end
    # call cannot distinguish a second check from a fallback retry.
    test "ModelRouter performs no spend check of its own" do
      calls = count_guard_calls do
        ModelRouter.new(task_type: :lesson_content).execute { |_model, _params| :did_not_call_a_provider }
      end

      assert_equal 0, calls,
        "ModelRouter checking as well as AiClient would silently halve every model's rpm"
      assert_not ModelRouter.private_instance_methods(false).include?(:check_cost_limit!)
      assert_not ModelRouter.private_instance_methods(false).include?(:check_rate_limit!)
    end

    test "one AiClient call consults the guard exactly once" do
      calls = count_guard_calls do
        AiClient.new(model: "definitely-not-a-model", task_type: :lesson_content).chat(prompt: "hi")
      rescue AiClient::RequestError
        # The model is unsupported on purpose: the guard runs BEFORE the provider
        # branch, so the refusal to route is irrelevant to what is being counted.
      end

      assert_equal 1, calls
    end

    # A refusal is a business decision, not a model failure: falling back would
    # ask the same guard about a different model and turn it into
    # AllModelsUnavailable.
    test "a refusal escapes ModelRouter untouched instead of triggering a fallback" do
      refuse_everything!

      assert_raises(SpendGuard::LimitExceeded) do
        ModelRouter.new(task_type: :lesson_content).execute do |_model, _params|
          AiClient.new(model: "gpt-4.1-mini", task_type: :lesson_content).chat(prompt: "hi")
        end
      end
    end

    test "the legacy ModelRouter error constant still catches a refusal" do
      refuse_everything!

      assert_raises(ModelRouter::RateLimitExceeded) do
        AiClient.new(model: "gpt-4.1-mini", task_type: :lesson_content).chat(prompt: "hi")
      end
    end

    # ── no half-written interaction, and a truthful student-facing outcome ───

    test "a refusal writes no AiInteraction row at all" do
      stub_elevenlabs_tts
      refuse_everything!
      before = AiInteraction.count

      assert_raises(SpendGuard::LimitExceeded) do
        AiClient.new(model: "elevenlabs", task_type: :voice_narration).chat(prompt: "hola")
      end

      assert_equal before, AiInteraction.count,
        "the guard refuses before any caller writes a row, so there is nothing half-written"
    end

    # A ceiling is a business limit, so the student must not be shown "we
    # couldn't build this lesson — try again in a few minutes" when the real
    # answer is "not today". ContentPipelineJob records WHY so the view can tell
    # the truth, and the job does not retry a decision that will not change.
    test "a lesson refused by the ceiling is marked as a budget stop, not a breakage" do
      user = create_test_user
      profile = LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
      route = LearningRoutesEngine::LearningRoute.create!(learning_profile: profile, topic: "Budget", locale: "en")
      preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: route.id, access_state: :preview)
      step = LearningRoutesEngine::RouteStep.create!(
        learning_route: route, route_module: preview, position: 1,
        title: "Lesson", content_type: :lesson, status: :available
      )
      refuse_everything!

      # `discard_on SpendGuard::LimitExceeded` means the job does NOT retry a
      # decision that will not change, so perform_now records and discards
      # rather than raising.
      LearningRoutesEngine::ContentPipelineJob.perform_now(step.id)

      metadata = step.reload.metadata
      assert_equal "budget", metadata["content_error_kind"]
      assert_equal false, metadata["content_generating"], "a refused step must not look in flight"
      assert I18n.t("learning_engine.content_failed.budget_title", default: nil).present?
      assert I18n.t("learning_engine.content_failed.budget_body", locale: :es, default: nil).present?
    end

    test "the refusal message is translated, not an internal string" do
      %i[en es].each do |locale|
        I18n.with_locale(locale) do
          error = assert_raises(SpendGuard::LimitExceeded) do
            Rails.application.config.ai_cost_alerts = @original_alerts.merge(daily_limit: 0)
            SpendGuard.call(model: "elevenlabs", task_type: :voice_narration)
          end

          assert_equal I18n.t("ai_orchestrator.spend_guard.daily_budget", locale: locale), error.message
          assert_no_match(/translation missing/, error.message)
        end
      end
    end
  end
end
