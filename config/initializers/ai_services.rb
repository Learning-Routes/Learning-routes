# AI Services Configuration
# API keys are loaded from ENV (set in .env) or Rails credentials as fallback.
#
# Required ENV variables:
#   OPENAI_API_KEY=OPENAI_API_KEY_REDACTED
#   ELEVENLABS_API_KEY=ELEVENLABS_API_KEY_REDACTED
#
# Optional ENV variables:
#   ANTHROPIC_API_KEY=sk-ant-... (not used as primary, available as fallback)
#   GEMINI_API_KEY=...

Rails.application.config.after_initialize do
  # Configure RubyLLM (unified provider for OpenAI, Anthropic, Gemini)
  RubyLLM.configure do |config|
    config.openai_api_key = Rails.application.credentials.dig(:openai, :api_key)
    config.anthropic_api_key = Rails.application.credentials.dig(:anthropic, :api_key)
    config.gemini_api_key = Rails.application.credentials.dig(:gemini, :api_key)

    # Request defaults
    config.request_timeout = 30
  end
end

# Default model parameters per task type
Rails.application.config.ai_model_defaults = {
  assessment_questions: { temperature: 0.7, max_tokens: 4096 },
  route_generation:     { temperature: 0.8, max_tokens: 8192 },
  # request_timeout overrides the 30s global above. Curriculum design is a single
  # large structured-output call: measured latencies are 21.6s-29.7s (median 26.7s),
  # i.e. the global timeout sits inside the normal distribution and roughly one call
  # in seven timed out on both primary and fallback before falling back to the
  # generic template. It runs inside WizardRouteGenerationJob, never a request
  # thread, so a generous ceiling costs nothing but patience.
  curriculum_design:    { temperature: 0.5, max_tokens: 6144, request_timeout: 120 },
  lesson_content:       { temperature: 0.7, max_tokens: 8192 },
  code_generation:      { temperature: 0.3, max_tokens: 4096 },
  exam_questions:       { temperature: 0.6, max_tokens: 4096 },
  quick_grading:        { temperature: 0.2, max_tokens: 1024 },
  voice_narration:      { temperature: 0.6, max_tokens: 4096 },
  image_generation:     { quality: "medium", size: "1024x1024" },
  quick_images:         { quality: "low", size: "1024x1024" },
  gap_analysis:         { temperature: 0.4, max_tokens: 4096 },
  reinforcement_generation: { temperature: 0.6, max_tokens: 4096 },
  explain_differently:       { temperature: 0.7, max_tokens: 4096 },
  give_example:              { temperature: 0.7, max_tokens: 4096 },
  simplify_content:          { temperature: 0.5, max_tokens: 4096 },
  exercise_hint:             { temperature: 0.5, max_tokens: 1024 }
}.freeze

# Maximum AI-generated images per lesson (configurable).
# ImageGenerationService uses medium quality for the first image of a lesson
# and low quality for the rest, so cost stays reasonable at higher caps
# (8 images ≈ 1×$0.07 + 7×$0.02 = ~$0.21 per lesson).
Rails.application.config.max_images_per_lesson = 8

# Cost alert thresholds (in cents)
Rails.application.config.ai_cost_alerts = {
  daily_limit: 5000,       # $50/day
  monthly_limit: 100_000,  # $1,000/month
  per_user_daily: 500      # $5/user/day
}.freeze
