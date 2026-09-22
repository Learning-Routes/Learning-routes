require "application_system_test_case"

# WP-36 task 9 §5. mc.js is ~186 KB and most lessons have no scene at all, so
# the Stimulus controller lazy-imports it inside `play()` rather than at the
# top of the file. An `import` that quietly moved back to the top would ship
# that bundle to every lesson, with nothing failing — this is the test that
# would catch it.
#
# Task 18 appends more motion-scene cases to this same file; this is
# deliberately its first.
class MotionSceneTest < ApplicationSystemTestCase
  def setup
    @user = Core::User.create!(
      name: "Motion", email: "motion-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, locale: "es"
    )
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Portugués", locale: "es", status: :active
    )
    preview = LearningRoutesEngine::RouteModule.find_by!(
      learning_route_id: @route.id, access_state: :preview
    )
    @step = @route.route_steps.create!(
      route_module: preview, title: "Sin escena", position: 0, status: :in_progress,
      content_type: :lesson, level: :nv1, bloom_level: 1,
      metadata: {
        # No "motion" section anywhere — the premise of the test below.
        "parsed_sections" => [
          { "type" => "concept", "title" => "Concepto", "body" => "Contenido sin movimiento." }
        ],
        "content_ready" => true
      }
    )
    ContentEngine::AiContent.create!(route_step: @step, content_type: :text, body: "## Concepto: x\nContenido sin movimiento.")
  end

  test "a lesson with no motion block never fetches the runtime" do
    visit_lesson_without_motion

    assert_selector ".lesson-sections-container", wait: 10
    requested = page.evaluate_script(
      "performance.getEntriesByType('resource').map(e => e.name).filter(n => n.includes('mc'))"
    )
    assert_equal [], requested,
      "mc.js was fetched on a lesson with no scene: the import is no longer lazy"
  end

  private

  def visit_lesson_without_motion
    visit core.sign_in_path
    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    assert_field "email", with: @user.email
    find("input[type='submit']").click
    assert_no_current_path core.sign_in_path, wait: 5

    visit learning_routes_engine.route_step_path(@route, @step)
  end
end
