puts "Seeding database..."

# === Core: Users ===
admin = Core::User.find_or_create_by!(email: "admin@learning-routes.com") do |user|
  user.name = "Admin User"
  user.password = "password123"
  user.password_confirmation = "password123"
  user.role = :admin
  user.locale = "en"
  user.timezone = "UTC"
  user.email_verified_at = Time.current
  user.onboarding_completed = true
end
puts "  Created admin: #{admin.email}"

teacher = Core::User.find_or_create_by!(email: "teacher@learning-routes.com") do |user|
  user.name = "Demo Teacher"
  user.password = "password123"
  user.password_confirmation = "password123"
  user.role = :teacher
  user.locale = "en"
  user.timezone = "UTC"
  user.email_verified_at = Time.current
  user.onboarding_completed = true
end
puts "  Created teacher: #{teacher.email}"

student = Core::User.find_or_create_by!(email: "student@learning-routes.com") do |user|
  user.name = "Demo Student"
  user.password = "password123"
  user.password_confirmation = "password123"
  user.role = :student
  user.locale = "en"
  user.timezone = "UTC"
  user.email_verified_at = Time.current
  user.onboarding_completed = true
end
puts "  Created student: #{student.email}"

# === Learning Routes: Profile + Route ===
profile = LearningRoutesEngine::LearningProfile.find_or_create_by!(user: student) do |p|
  p.current_level = "beginner"
  p.interests = ["programming", "python"]
  p.learning_style = ["visual", "hands_on"]
  p.goal = "Learn Python programming fundamentals"
  p.timeline = "3_months"
end
puts "  Created learning profile for: #{student.name}"

route = LearningRoutesEngine::LearningRoute.find_or_create_by!(
  learning_profile: profile,
  topic: "Python Programming Fundamentals"
) do |r|
  r.subject_area = "Programming"
  r.status = :active
  r.current_step = 0
  r.total_steps = 12
  r.difficulty_progression = { nv1: 5, nv2: 4, nv3: 3 }
end
puts "  Created learning route: #{route.topic}"

# === Learning Routes: Route Steps ===
steps_data = [
  { position: 0, title: "Introduction to Python", level: :nv1, content_type: :lesson, status: :available, estimated_minutes: 15 },
  { position: 1, title: "Variables and Data Types", level: :nv1, content_type: :lesson, status: :locked, estimated_minutes: 20 },
  { position: 2, title: "Practice: Variables", level: :nv1, content_type: :exercise, status: :locked, estimated_minutes: 15 },
  { position: 3, title: "Control Flow: If/Else", level: :nv1, content_type: :lesson, status: :locked, estimated_minutes: 25 },
  { position: 4, title: "NV1 Assessment", level: :nv1, content_type: :assessment, status: :locked, estimated_minutes: 20 },
  { position: 5, title: "Functions and Modules", level: :nv2, content_type: :lesson, status: :locked, estimated_minutes: 30 },
  { position: 6, title: "Lists and Dictionaries", level: :nv2, content_type: :lesson, status: :locked, estimated_minutes: 25 },
  { position: 7, title: "Practice: Data Structures", level: :nv2, content_type: :exercise, status: :locked, estimated_minutes: 20 },
  { position: 8, title: "NV2 Assessment", level: :nv2, content_type: :assessment, status: :locked, estimated_minutes: 25 },
  { position: 9, title: "Object-Oriented Programming", level: :nv3, content_type: :lesson, status: :locked, estimated_minutes: 35 },
  { position: 10, title: "File I/O and Error Handling", level: :nv3, content_type: :lesson, status: :locked, estimated_minutes: 30 },
  { position: 11, title: "Final Comprehensive Exam", level: :nv3, content_type: :assessment, status: :locked, estimated_minutes: 40 }
]

steps_data.each do |step_data|
  LearningRoutesEngine::RouteStep.find_or_create_by!(
    learning_route: route,
    position: step_data[:position]
  ) do |step|
    step.assign_attributes(step_data)
  end
end
puts "  Created #{steps_data.size} route steps"

# === AI Orchestrator: Model Configs ===
model_configs = [
  { model_name: "gpt-5.2", task_type: "assessment_questions", priority: 0, fallback_model: "gpt-5.1-codex-mini" },
  { model_name: "gpt-5.2", task_type: "route_generation", priority: 0, fallback_model: "gpt-5.1-codex-mini" },
  { model_name: "gpt-5.2", task_type: "lesson_content", priority: 0, fallback_model: "gpt-5.1-codex-mini" },
  { model_name: "gpt-5.2", task_type: "code_generation", priority: 0, fallback_model: "gpt-5.1-codex-mini" },
  { model_name: "gpt-5.2", task_type: "exam_questions", priority: 0, fallback_model: "gpt-5.1-codex-mini" },
  { model_name: "gpt-5.1-codex-mini", task_type: "quick_grading", priority: 0, fallback_model: "gpt-5.2" },
  { model_name: "gpt-5.1-codex-mini", task_type: "voice_narration", priority: 0, fallback_model: "gpt-5.2" },
  { model_name: "nanobanana-pro", task_type: "image_generation", priority: 0, fallback_model: "nanobanana-flash" },
  { model_name: "nanobanana-flash", task_type: "quick_images", priority: 0, fallback_model: "nanobanana-pro" }
]

model_configs.each do |config_data|
  existing = AiOrchestrator::AiModelConfig.where(task_type: config_data[:task_type]).exists?
  unless existing
    AiOrchestrator::AiModelConfig.connection.execute(
      ActiveRecord::Base.sanitize_sql_array([
        "INSERT INTO ai_orchestrator_ai_model_configs (id, model_name, task_type, priority, fallback_model, enabled, created_at, updated_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, true, NOW(), NOW())",
        config_data[:model_name], config_data[:task_type], config_data[:priority], config_data[:fallback_model]
      ])
    )
  end
end
puts "  Created AI model configs"

# === Content Delivery Seed ===
load Rails.root.join("db/seeds/content_delivery_seed.rb")

puts "Seeding complete!"
