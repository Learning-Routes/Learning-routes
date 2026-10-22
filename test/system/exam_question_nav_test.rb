require "application_system_test_case"

# Found while moving the exam onto the foundations: answering a question was
# meant to mark it in the side list, but the controller only toggled Tailwind
# classes that the button's inline style overrode, so nothing changed. An
# answered question reads as done: the positive colour on its soft fill.
class ExamQuestionNavTest < ApplicationSystemTestCase
  test "answering a question marks it in the side list" do
    user = Core::User.create!(name: "Ana", email: "exam-#{SecureRandom.hex(4)}@example.com", password: "password123",
                              password_confirmation: "password123", email_verified_at: Time.current, locale: "es")
    profile = LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
    route = LearningRoutesEngine::LearningRoute.create!(learning_profile: profile, topic: "Portugués", locale: "es", status: :active)
    preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: route.id, access_state: :preview)
    step = route.route_steps.create!(route_module: preview, title: "Examen", position: 0, status: :available,
                                     content_type: :assessment, level: :nv1, bloom_level: 1)
    assessment = Assessments::Assessment.create!(route_step: step, assessment_type: :level_up, passing_score: 70)
    2.times do |i|
      Assessments::Question.create!(assessment: assessment, body: "Pregunta #{i + 1}", question_type: :multiple_choice,
                                    options: ["A) uno", "B) dos"], correct_answer: "A", difficulty: 1, bloom_level: 1)
    end
    Assessments::AssessmentResult.open_attempt_for!(user: user, assessment: assessment)
    visit core.sign_in_path
    fill_in "email", with: user.email
    fill_in "password", with: "password123"
    find("form[action='#{core.sign_in_path}'] [type='submit']").click
    assert_no_current_path core.sign_in_path, wait: 5

    visit assessments.take_assessment_path(assessment)
    item = find("[data-question-nav-target='navItem'][data-index='0']")
    before = item.evaluate_script("getComputedStyle(this).backgroundColor")
    first("input[type='radio'][data-index='0']").click

    positive = page.evaluate_script("getComputedStyle(document.documentElement).getPropertyValue('--color-positive').trim()")
    assert_not_equal before, item.evaluate_script("getComputedStyle(this).backgroundColor"), "the answered question's fill did not change"
    probe = page.evaluate_script("(() => { const d = document.createElement('div'); d.style.color = #{'var(--color-positive)'.to_json}; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c })()")
    assert_equal probe, item.evaluate_script("getComputedStyle(this).color"), "the answered question is not in the positive colour (#{positive})"
  end
end
