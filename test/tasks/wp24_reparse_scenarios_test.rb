require "test_helper"
require "rake"

# The parser fix alone changes nothing a student can see: `parsed_sections` is a
# persisted cache and `StepsController#show` renders from it. This task rewrites
# that cache — and its one hard rule is that it must never rewrite a step whose
# new parse would move a block, because `block_attempts.section_index` indexes
# into the array and every recorded attempt would silently re-point.
class Wp24ReparseScenariosTest < ActiveSupport::TestCase
  # The body a real lesson had: the last option swallows the sub-heading, the
  # mermaid fence and the trailing prose.
  BODY = <<~MARKDOWN
    ## Escenario: Una queja

    Un cliente se queja del servicio.
    OPTION A: Pedir disculpas
    Se queda contigo.
    OPTION B: Ignorarla
    Se marcha y no vuelve.

    ### Lo que ocurrió de verdad

    ```mermaid
    sequenceDiagram
        Cliente->>Soporte: Reclamación
    ```
  MARKDOWN

  # What the OLD parser persisted for that body.
  BROKEN_SECTIONS = [
    {
      "type" => "scenario",
      "title" => "Una queja",
      "situation" => "Un cliente se queja del servicio.",
      "options" => [
        { "label" => "Pedir disculpas", "consequence" => "Se queda contigo." },
        { "label" => "Ignorarla",
          "consequence" => "Se marcha y no vuelve. ### Lo que ocurrió de verdad " \
                           "```mermaid sequenceDiagram Cliente->>Soporte: Reclamación ```" }
      ]
    },
    { "type" => "summary", "title" => "Resumen", "key_points" => [] }
  ].freeze

  def setup
    Rake::Task.clear
    Rails.application.load_tasks

    @user = create_test_user
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Atención", locale: "es", status: :active
    )
    @preview = LearningRoutesEngine::RouteModule.find_by!(
      learning_route_id: @route.id, access_state: :preview
    )
  end

  def teardown
    Rake::Task.clear
  end

  test "the census reports what would change and modifies nothing" do
    step = build_step(BROKEN_SECTIONS)
    before = step.metadata["parsed_sections"]

    output = run_task("wp24:scenario_census")

    assert_match(/steps with a persisted scenario:\s+1/, output)
    assert_match(/consequences would change:\s+1/, output)
    assert_match(/an aftermath would be recovered:\s+1/, output)
    assert_equal before, step.reload.metadata["parsed_sections"],
      "the census must be read only"
  end

  test "reparsing frees the swallowed content and recovers the aftermath" do
    step = build_step(BROKEN_SECTIONS)

    run_task("wp24:reparse_scenarios")

    scenario = step.reload.metadata["parsed_sections"].first
    last_consequence = scenario["options"].last["consequence"]

    assert_equal "Se marcha y no vuelve.", last_consequence,
      "the last option still holds the rest of the section"
    assert_includes scenario["aftermath"].to_s, "```mermaid",
      "the diagram must come back as aftermath, with its fence intact"
    assert_includes scenario["aftermath"].to_s, "Lo que ocurrió de verdad"
  end

  # THE SAFETY RULE.
  test "a step whose new parse would change the section count is skipped and reported" do
    # One section too few: the real body parses to scenario + summary, so a
    # persisted array of one is position-incompatible.
    step = build_step([{ "type" => "scenario", "title" => "Una queja", "options" => [] }])
    before = step.metadata["parsed_sections"]

    output = run_task("wp24:reparse_scenarios")

    assert_equal before, step.reload.metadata["parsed_sections"],
      "rewriting this step would re-point every recorded block_attempt at a different block"
    assert_match(/skipped \(unsafe\):\s+1/, output)
    assert_includes output, step.id
  end

  test "the census names the incompatible steps instead of silently passing them" do
    step = build_step([{ "type" => "scenario", "title" => "Una queja", "options" => [] }])

    output = run_task("wp24:scenario_census")

    assert_match(/NOT position-compatible \(skipped\):\s+1/, output)
    assert_includes output, step.id
    assert_match(/1 sections -> 2/, output)
  end

  test "a second run changes nothing" do
    step = build_step(BROKEN_SECTIONS)
    run_task("wp24:reparse_scenarios")
    after_first = step.reload.metadata["parsed_sections"]

    output = run_task("wp24:reparse_scenarios")

    assert_equal after_first, step.reload.metadata["parsed_sections"]
    assert_match(/rewritten:\s+0/, output)
    assert_match(/already current:\s+1/, output)
  end

  test "a step with no usable content is skipped, not crashed on" do
    step = @route.route_steps.create!(
      route_module: @preview, title: "Sin contenido", position: 0, status: :available,
      content_type: :lesson, level: :nv1, bloom_level: 1,
      metadata: { "parsed_sections" => BROKEN_SECTIONS.map(&:deep_dup) }
    )

    output = run_task("wp24:scenario_census")

    assert_match(/no usable AiContent \(skipped\):\s+1/, output)
    assert_includes output, step.id
  end

  private

  def build_step(sections)
    step = @route.route_steps.create!(
      route_module: @preview, title: "Quejas", position: 0, status: :available,
      content_type: :lesson, level: :nv1, bloom_level: 1,
      metadata: { "parsed_sections" => sections.map(&:deep_dup) }
    )
    ContentEngine::AiContent.create!(route_step: step, content_type: :text, body: BODY)
    step
  end

  def run_task(name)
    task = Rake::Task[name]
    task.reenable
    capture_io { task.invoke }.first
  end
end
