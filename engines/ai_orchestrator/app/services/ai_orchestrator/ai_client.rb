module AiOrchestrator
  class AiClient
    RUBY_LLM_MODELS = %w[
      gpt-5.2 gpt-5.1-codex-mini
      claude-opus-4-6 claude-haiku-4-5 claude-sonnet-4-5
    ].freeze

    class RequestError < StandardError; end
    class TimeoutError < RequestError; end

    def initialize(model:, task_type: nil, user: nil)
      @model = model
      @task_type = task_type
      @user = user
    end

    def chat(prompt:, system_prompt: nil, params: {})
      if RUBY_LLM_MODELS.include?(@model)
        chat_via_ruby_llm(prompt: prompt, system_prompt: system_prompt, params: params)
      elsif @model == "elevenlabs"
        request_elevenlabs(text: prompt, params: params)
      elsif @model.start_with?("nanobanana")
        request_nanobanana(prompt: prompt, params: params)
      else
        raise RequestError, "Unsupported model: #{@model}"
      end
    end

    private

    def chat_via_ruby_llm(prompt:, system_prompt: nil, params: {})
      chat = RubyLLM.chat(model: @model)

      model_defaults = Rails.application.config.ai_model_defaults[@task_type&.to_sym] || {}
      merged_params = model_defaults.merge(params).except(:response_format)

      chat.with_temperature(merged_params[:temperature]) if merged_params[:temperature]
      chat.with_max_tokens(merged_params[:max_tokens]) if merged_params[:max_tokens]

      if system_prompt.present?
        chat.with_instructions(system_prompt)
      end

      start_time = monotonic_now
      response = chat.ask(prompt)
      elapsed_ms = ((monotonic_now - start_time) * 1000).round

      {
        content: response.content,
        model: @model,
        input_tokens: response.input_tokens || 0,
        output_tokens: response.output_tokens || 0,
        latency_ms: elapsed_ms
      }
    rescue => e
      if e.message.include?("timeout") || e.message.include?("Timeout")
        raise TimeoutError, "Request to #{@model} timed out"
      end
      raise RequestError, "#{@model} request failed: #{e.message}"
    end

    def request_elevenlabs(text:, params: {})
      api_key = Rails.application.credentials.dig(:elevenlabs, :api_key) || ENV["ELEVENLABS_API_KEY"]
      voice_id = params[:voice_id] || Rails.application.credentials.dig(:elevenlabs, :default_voice_id) || "21m00Tcm4TlvDq8ikWAM"

      defaults = Rails.application.config.ai_model_defaults[:voice_narration] || {}
      merged = defaults.merge(params)

      start_time = monotonic_now
      response = HTTParty.post(
        "https://api.elevenlabs.io/v1/text-to-speech/#{voice_id}",
        headers: {
          "xi-api-key" => api_key,
          "Content-Type" => "application/json",
          "Accept" => "audio/mpeg"
        },
        body: {
          text: text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: merged[:stability] || 0.5,
            similarity_boost: merged[:similarity_boost] || 0.75
          }
        }.to_json,
        timeout: 60
      )
      elapsed_ms = ((monotonic_now - start_time) * 1000).round

      unless response.success?
        raise RequestError, "ElevenLabs API error: #{response.code} - #{response.body}"
      end

      {
        content: response.body,
        model: "elevenlabs",
        input_tokens: text.length,
        output_tokens: 0,
        latency_ms: elapsed_ms,
        content_type: "audio/mpeg"
      }
    rescue Net::ReadTimeout, Net::OpenTimeout => e
      raise TimeoutError, "ElevenLabs request timed out: #{e.message}"
    end

    def request_nanobanana(prompt:, params: {})
      api_key = Rails.application.credentials.dig(:nanobanana, :api_key) || ENV["NANOBANANA_API_KEY"]
      api_url = Rails.application.credentials.dig(:nanobanana, :api_url) || "https://api.nanobanana.com/v1"

      defaults = Rails.application.config.ai_model_defaults[
        @model == "nanobanana-pro" ? :image_generation : :quick_images
      ] || {}
      merged = defaults.merge(params)

      start_time = monotonic_now
      response = HTTParty.post(
        "#{api_url}/generate",
        headers: {
          "Authorization" => "Bearer #{api_key}",
          "Content-Type" => "application/json"
        },
        body: {
          model: @model,
          prompt: prompt,
          width: merged[:width] || 1024,
          height: merged[:height] || 1024
        }.to_json,
        timeout: 120
      )
      elapsed_ms = ((monotonic_now - start_time) * 1000).round

      unless response.success?
        raise RequestError, "NanoBanana API error: #{response.code} - #{response.body}"
      end

      parsed = JSON.parse(response.body)
      {
        content: parsed["image_url"] || parsed["data"],
        model: @model,
        input_tokens: prompt.length,
        output_tokens: 0,
        latency_ms: elapsed_ms,
        content_type: "image/png"
      }
    rescue Net::ReadTimeout, Net::OpenTimeout => e
      raise TimeoutError, "NanoBanana request timed out: #{e.message}"
    end

    def monotonic_now
      Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end
  end
end
