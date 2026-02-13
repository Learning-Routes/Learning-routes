# This file should ensure the existence of records required to run the application in every environment
# (production, development, test). The code here should be idempotent so that it can be executed at any
# point in every environment. The data can then be loaded with the bin/rails db:seed command (or created
# alongside the database with db:setup).

puts "Seeding database..."

# === Core: Users ===
admin = Core::User.find_or_create_by!(email: "admin@learning-routes.com") do |user|
  user.name = "Admin User"
  user.password = "password123"
  user.password_confirmation = "password123"
  user.role = :admin
  user.locale = "en"
  user.timezone = "UTC"
end
puts "  Created admin: #{admin.email}"

teacher = Core::User.find_or_create_by!(email: "teacher@learning-routes.com") do |user|
  user.name = "Demo Teacher"
  user.password = "password123"
  user.password_confirmation = "password123"
  user.role = :teacher
  user.locale = "en"
  user.timezone = "UTC"
end
puts "  Created teacher: #{teacher.email}"

student = Core::User.find_or_create_by!(email: "student@learning-routes.com") do |user|
  user.name = "Demo Student"
  user.password = "password123"
  user.password_confirmation = "password123"
  user.role = :student
  user.locale = "en"
  user.timezone = "UTC"
end
puts "  Created student: #{student.email}"

# === Learning Routes: Profile + Route ===
profile = LearningRoutesEngine::LearningProfile.find_or_create_by!(user: student) do |p|
  p.current_level = "beginner"
  p.interests = ["programming", "python"]
  p.learning_style = ["visual", "hands_on"]
  p.goal = "Learn Python programming fundamentals"
  p.timeline = "3 months"
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
  { model_name: "claude-opus-4-6", task_type: "assessment_questions", priority: 0, fallback_model: "gpt-5.2" },
  { model_name: "gpt-5.2", task_type: "route_generation", priority: 0, fallback_model: "claude-opus-4-6" },
  { model_name: "claude-opus-4-6", task_type: "lesson_content", priority: 0, fallback_model: "gpt-5.2" },
  { model_name: "gpt-5.2", task_type: "code_generation", priority: 0, fallback_model: "claude-opus-4-6" },
  { model_name: "claude-opus-4-6", task_type: "exam_questions", priority: 0, fallback_model: "gpt-5.2" },
  { model_name: "claude-haiku-4-5", task_type: "quick_grading", priority: 0, fallback_model: "gpt-5.1-codex-mini" },
  { model_name: "elevenlabs", task_type: "voice_narration", priority: 0, fallback_model: nil },
  { model_name: "nanobanana-pro", task_type: "image_generation", priority: 0, fallback_model: "nanobanana-flash" },
  { model_name: "nanobanana-flash", task_type: "quick_images", priority: 0, fallback_model: "nanobanana-pro" }
]

model_configs.each do |config_data|
  AiOrchestrator::AiModelConfig.find_or_create_by!(
    model_name: config_data[:model_name],
    task_type: config_data[:task_type]
  ) do |config|
    config.assign_attributes(config_data)
  end
end
puts "  Created #{model_configs.size} AI model configs"

puts "Seeding complete!"
