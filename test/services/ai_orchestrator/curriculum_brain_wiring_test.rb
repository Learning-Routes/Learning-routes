require "test_helper"

# NAME MATTERS: engines/ai_orchestrator/test/.../curriculum_brain_test.rb already
# defines AiOrchestrator::CurriculumBrainTest, which drives the parse -> validate ->
# normalize pipeline directly. Reusing that name reopens the same class, so the two
# setup/helper definitions clobber each other and both files fail once the whole
# suite is loaded. This class covers the WIRING instead: Orchestrate integration,
# configuration-vs-content error handling, and the schema-shaped response path.
class AiOrchestrator::CurriculumBrainWiringTest < ActiveSupport::TestCase
  # Minitest 6 moved Object#stub out into the separate `minitest-mock` gem, which
  # this app does not bundle. Rather than add a dependency for four call sites,
  # swap the singleton method and always put it back.
  # Restore by REMOVING the stub, not by defining a delegating wrapper over the
  # captured method. Wrapping leaves a permanent singleton method behind, so the
  # next test captures the wrapper as its "original" and restoring recurses forever.
  # `create!` is inherited from ActiveRecord and owns no singleton method, so there
  # is nothing to put back; `Orchestrate.call` owns one, so it is reinstated.
  def with_stubbed(mod, name, impl)
    singleton = mod.singleton_class
    owned = singleton.instance_methods(false).include?(name) ||
            singleton.private_instance_methods(false).include?(name)
    original = owned ? singleton.instance_method(name) : nil

    mod.define_singleton_method(name) { |*args, **kwargs, &blk| impl.call(*args, **kwargs, &blk) }
    yield
  ensure
    singleton.send(:remove_method, name)
    singleton.send(:define_method, name, original) if original
  end

  def setup
    @user = Core::User.create!(
      name: "Brain Test",
      email: "brain-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      email_verified_at: Time.current
    )
    @request = RouteRequest.create!(
      user: @user, topics: ["languages"], custom_topic: "Portuguese for Spanish speakers",
      level: "beginner", pace: "steady", goals: ["personal"], status: "pending"
    )
  end

  def localised_step(title)
    { "en" => { "title" => title, "description" => "d" },
      "es" => { "title" => title, "description" => "d" } }
  end

  def valid_payload(step_count: 5)
    steps = step_count.times.map do |i|
      {
        "label" => "Step #{i}", "description" => "Learn thing #{i}",
        "level" => 1, "level_enum" => "nv1", "bloom_level" => 1,
        "content_type" => i == step_count - 1 ? "assessment" : "lesson",
        "delivery_format" => "mixed", "estimated_minutes" => 20,
        "prerequisites" => i.zero? ? [] : [i - 1],
        "exercise_types" => %w[flashcards match], "topics" => %w[a b],
        "translations" => localised_step("Step #{i}")
      }
    end

    {
      "title" => "Portuguese Basics", "subtitle" => "Speak from day one",
      "subject_area" => "Language · Portuguese", "subject_family" => "language",
      "translations" => {
        "en" => { "title" => "Portuguese Basics", "subtitle" => "s", "subject_area" => "a" },
        "es" => { "title" => "Portugués Básico", "subtitle" => "s", "subject_area" => "a" }
      },
      "steps" => steps
    }
  end

  # Stub Orchestrate.call so these tests exercise CurriculumBrain's parsing and
  # validation without hitting the network. The real API path is proven separately
  # (see WP5_HANDOFF.md) — mocks cannot catch a dead model ID, and unit tests are
  # not where that gets caught.
  def stub_orchestrate(response:, completed: true)
    interaction = AiOrchestrator::AiInteraction.new(
      model: "gpt-4.1-mini", task_type: "curriculum_design", prompt: "x",
      status: completed ? :completed : :failed, response: response
    )
    with_stubbed(AiOrchestrator::Orchestrate, :call, ->(**) { interaction }) { yield }
  end

  test "returns a normalized structure for a valid response" do
    stub_orchestrate(response: valid_payload.to_json) do
      result = AiOrchestrator::CurriculumBrain.design(
        route_request: @request, user: @user, content_locale: "es"
      )

      assert_not_nil result, "expected a curriculum, got nil (i.e. a template fallback)"
      assert_equal "Portuguese Basics", result[:title]
      assert_equal "language", result[:subject_family]
      assert_equal 5, result[:steps].size
      assert_equal "Step 0", result[:steps].first[:label]
      assert_equal [], result[:steps].first[:prerequisites]
    end
  end

  test "parses a response the provider returned with a schema (no markdown fence)" do
    # with_schema responses arrive as raw JSON, re-serialized by AiClient. No fences,
    # no prose — this is the shape the curriculum_design path now actually produces.
    stub_orchestrate(response: valid_payload(step_count: 3).to_json) do
      result = AiOrchestrator::CurriculumBrain.design(
        route_request: @request, user: @user, content_locale: "en"
      )
      assert_equal 3, result[:steps].size
    end
  end

  # --- Prerequisite repair ---
  #
  # Measured against the live API, a step listing itself or a later step as a
  # prerequisite was THE dominant failure: it discarded an otherwise excellent
  # curriculum and served the generic template instead. A JSON Schema cannot express
  # "integers strictly less than this element's own index", so it has to be repaired.

  test "a self-referential prerequisite is repaired rather than discarding the curriculum" do
    payload = valid_payload
    payload["steps"][3]["prerequisites"] = [2, 3] # 3 refers to itself

    stub_orchestrate(response: payload.to_json) do
      result = AiOrchestrator::CurriculumBrain.design(
        route_request: @request, user: @user, content_locale: "en"
      )

      assert_not_nil result, "one bad index should not cost the whole curriculum"
      assert_equal [2], result[:steps][3][:prerequisites]
    end
  end

  test "a forward-referencing prerequisite is dropped" do
    payload = valid_payload
    payload["steps"][1]["prerequisites"] = [0, 4] # 4 is a later step

    stub_orchestrate(response: payload.to_json) do
      result = AiOrchestrator::CurriculumBrain.design(
        route_request: @request, user: @user, content_locale: "en"
      )

      assert_equal [0], result[:steps][1][:prerequisites]
    end
  end

  test "repair only ever removes edges, never invents them" do
    payload = valid_payload
    payload["steps"][2]["prerequisites"] = [0, 1]

    stub_orchestrate(response: payload.to_json) do
      result = AiOrchestrator::CurriculumBrain.design(
        route_request: @request, user: @user, content_locale: "en"
      )

      assert_equal [0, 1], result[:steps][2][:prerequisites], "valid prerequisites must survive untouched"
      # Every surviving edge points strictly backwards, so the graph stays acyclic.
      result[:steps].each_with_index do |step, idx|
        step[:prerequisites].each { |p| assert p < idx, "step #{idx} kept a non-backward edge #{p}" }
      end
    end
  end

  test "repair does not rescue a genuinely wrong curriculum" do
    # Deliberate: only the prerequisite-ordering error is patched. Structural errors
    # the model has no business making still fall back to the template.
    payload = valid_payload
    payload["steps"].first["content_type"] = "assessment" # testing before teaching

    stub_orchestrate(response: payload.to_json) do
      assert_nil AiOrchestrator::CurriculumBrain.design(
        route_request: @request, user: @user, content_locale: "en"
      )
    end
  end

  test "falls back quietly when the model returns an unusable structure" do
    # NOTE: this used to use a forward-referencing prerequisite, which repair! now
    # legitimately fixes. Use a value that cannot be inferred or patched instead.
    bad = valid_payload
    bad["steps"][2]["bloom_level"] = 99

    stub_orchestrate(response: bad.to_json) do
      assert_nil AiOrchestrator::CurriculumBrain.design(
        route_request: @request, user: @user, content_locale: "en"
      )
    end
  end

  test "falls back quietly when the response is not JSON" do
    stub_orchestrate(response: "I'm sorry, I can't help with that.") do
      assert_nil AiOrchestrator::CurriculumBrain.design(
        route_request: @request, user: @user, content_locale: "en"
      )
    end
  end

  # --- The regression that matters: configuration errors must not look like content errors ---

  test "a configuration error is raised, not swallowed as a bad response" do
    # Rails.env.local? is true under test, so a misconfiguration surfaces instead of
    # quietly degrading to the template. In production this same branch logs at error,
    # reports to Rails.error, and returns nil so the user still gets a route.
    raiser = ->(**) { raise AiOrchestrator::Orchestrate::ConfigurationError, "task_type not registered" }

    with_stubbed(AiOrchestrator::Orchestrate, :call, raiser) do
      assert_raises(AiOrchestrator::Orchestrate::ConfigurationError) do
        AiOrchestrator::CurriculumBrain.design(
          route_request: @request, user: @user, content_locale: "en"
        )
      end
    end
  end

  test "Orchestrate translates a record-validation failure into ConfigurationError" do
    # The other half of the same guarantee, at the source. Every routed task type is
    # now valid (that is the invariant test), so the only way to reach this branch is
    # to make the insert fail directly — which is exactly what an unregistered
    # task_type or model does inside Orchestrate.
    invalid = AiOrchestrator::AiInteraction.new(model: "nope", task_type: "nope", prompt: "x")
    invalid.valid?

    raise_invalid = ->(*) { raise ActiveRecord::RecordInvalid.new(invalid) }

    with_stubbed(AiOrchestrator::AiInteraction, :create!, raise_invalid) do
      error = assert_raises(AiOrchestrator::Orchestrate::ConfigurationError) do
        # `locale` is required since WP-9 — PromptBuilder raises without it in
        # dev/test rather than silently defaulting the prompt to English. This test is
        # about the RecordInvalid translation, so supply one and stay on topic.
        AiOrchestrator::Orchestrate.call(
          task_type: :curriculum_design, variables: { locale: "es" }, user: @user, async: false
        )
      end

      assert_match(/TASK_TYPES/, error.message)
      assert_match(/SUPPORTED_MODELS/, error.message)
    end
  end
end
