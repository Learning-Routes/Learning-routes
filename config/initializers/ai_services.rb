# AI Services Configuration
# API keys are loaded from Rails credentials (bin/rails credentials:edit)
#
# Expected credentials structure:
#   openai:
#     api_key: sk-...
#   anthropic:
#     api_key: sk-ant-...
#   gemini:
#     api_key: ...
#   elevenlabs:
#     api_key: ...
#     default_voice_id: ...
#   nanobanana:
#     api_key: ...
#     api_url: https://api.nanobanana.com/v1

Rails.application.config.after_initialize do
  # Configure RubyLLM (unified provider for OpenAI, Anthropic, Gemini)
  RubyLLM.configure do |config|
    config.openai_api_key = Rails.application.credentials.dig(:openai, :api_key).presence || ENV["OPENAI_API_KEY"]
    config.anthropic_api_key = Rails.application.credentials.dig(:anthropic, :api_key).presence || ENV["ANTHROPIC_API_KEY"]
    config.gemini_api_key = Rails.application.credentials.dig(:gemini, :api_key).presence || ENV["GEMINI_API_KEY"]

    # Request defaults
    config.request_timeout = 30
  end
end

# Default model parameters per task type
Rails.application.config.ai_model_defaults = {
  assessment_questions: { temperature: 0.7, max_tokens: 4096 },
  route_generation:     { temperature: 0.8, max_tokens: 8192 },
  lesson_content:       { temperature: 0.7, max_tokens: 8192 },
  code_generation:      { temperature: 0.3, max_tokens: 4096 },
  exam_questions:       { temperature: 0.6, max_tokens: 4096 },
  quick_grading:        { temperature: 0.2, max_tokens: 1024 },
  voice_narration:      { stability: 0.5, similarity_boost: 0.75 },
  image_generation:     { width: 1024, height: 1024 },
  quick_images:         { width: 512, height: 512 },
  gap_analysis:         { temperature: 0.4, max_tokens: 4096 },
  reinforcement_generation: { temperature: 0.6, max_tokens: 4096 },
  explain_differently:       { temperature: 0.7, max_tokens: 4096 },
  give_example:              { temperature: 0.7, max_tokens: 4096 },
  simplify_content:          { temperature: 0.5, max_tokens: 4096 },
  exercise_hint:             { temperature: 0.5, max_tokens: 1024 }
}.freeze

# Cost alert thresholds (in cents)
Rails.application.config.ai_cost_alerts = {
  daily_limit: 5000,       # $50/day
  monthly_limit: 100_000,  # $1,000/month
  per_user_daily: 500      # $5/user/day
}.freeze
