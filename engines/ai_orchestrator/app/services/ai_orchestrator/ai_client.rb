require "net/http"

module AiOrchestrator
  class AiClient
    RUBY_LLM_MODELS = %w[
      gpt-5.2 gpt-4.1-mini
      claude-opus-4-5 claude-haiku-4-5 claude-sonnet-4-5
    ].freeze

    GPT_IMAGE_MODELS = %w[gpt-image-1].freeze

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
      elsif GPT_IMAGE_MODELS.include?(@model)
        request_gpt_image(prompt: prompt, params: params)
      else
        raise RequestError, "Unsupported model: #{@model}"
      end
    end

    private

    def chat_via_ruby_llm(prompt:, system_prompt: nil, params: {})
      model_defaults = Rails.application.config.ai_model_defaults[@task_type&.to_sym] || {}
      chat = build_chat(model_defaults.merge(params)[:request_timeout])

      # :response_format is still dropped here, but it is no longer the only signal.
      # It was a bare `json` marker in the prompt YAML that nothing ever acted on;
      # real structured output now comes from SchemaRegistry below, which sends the
      # provider an actual JSON Schema rather than a hint.
      merged_params = model_defaults.merge(params).except(:response_format)

      schema = SchemaRegistry.for(@task_type)
      chat.with_schema(schema) if schema

      chat.with_temperature(merged_params[:temperature]) if merged_params[:temperature]
      if merged_params[:max_tokens]
        # GPT-5.x models require max_completion_tokens; GPT-4.x supports max_tokens
        token_key = @model.start_with?("gpt-5") ? :max_completion_tokens : :max_tokens
        chat.with_params(token_key => merged_params[:max_tokens])
      end

      if system_prompt.present?
        chat.with_instructions(system_prompt)
      end

      start_time = monotonic_now
      response = chat.ask(prompt)
      elapsed_ms = ((monotonic_now - start_time) * 1000).round

      {
        # When a schema is set, RubyLLM JSON.parses the body and hands back a Hash
        # (ruby_llm-1.11.0/lib/ruby_llm/chat.rb:147-154). AiInteraction#response is a
        # text column and every consumer parses a JSON string, so re-serialize —
        # storing a Hash would persist Ruby's `{"a"=>1}` inspect form, which is not
        # valid JSON and would fail on the way back out.
        content: serialize_content(response.content),
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
      api_key = Rails.application.credentials.dig(:elevenlabs, :api_key)
      voice_id = params[:voice_id] || Rails.application.credentials.dig(:elevenlabs, :default_voice_id) || "21m00Tcm4TlvDq8ikWAM"

      defaults = Rails.application.config.ai_model_defaults[:voice_narration] || {}
      merged = defaults.merge(params)

      start_time = monotonic_now

      # Use Net::HTTP directly instead of HTTParty to avoid binary response
      # auto-parsing. HTTParty tries to parse audio/mpeg as XML/JSON which
      # corrupts the binary audio data.
      uri = URI("https://api.elevenlabs.io/v1/text-to-speech/#{voice_id}")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.read_timeout = 60
      http.open_timeout = 15

      request = Net::HTTP::Post.new(uri.path)
      request["xi-api-key"] = api_key
      request["Content-Type"] = "application/json"
      request["Accept"] = "audio/mpeg"
      request.body = {
        text: text,
        model_id: merged[:model_id] || "eleven_multilingual_v2",
        voice_settings: {
          stability: merged[:stability] || 0.5,
          similarity_boost: merged[:similarity_boost] || 0.75
        }
      }.to_json

      response = http.request(request)
      elapsed_ms = ((monotonic_now - start_time) * 1000).round

      unless response.is_a?(Net::HTTPSuccess)
        raise RequestError, "ElevenLabs API error: #{response.code} - #{response.body&.first(500)}"
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

    def request_gpt_image(prompt:, params: {})
      defaults = Rails.application.config.ai_model_defaults[@task_type&.to_sym] || {}
      merged = defaults.merge(params)

      size = merged[:size] || "1024x1024"
      quality = merged[:quality] || "medium"

      start_time = monotonic_now
      # `quality` is a gpt-image-1 parameter, not a RubyLLM one. Passing it as a
      # keyword raised ArgumentError: unknown keyword: :quality on every single call,
      # which the rescue below turned into "GPT Image generation failed" — so image
      # generation had never worked, and the failure read like a provider problem.
      # RubyLLM.paint takes model:, size:, with:, mask: and params:; provider-specific
      # options go inside params:.
      image = RubyLLM.paint(
        prompt,
        model: @model,
        size: size,
        params: { quality: quality }
      )
      elapsed_ms = ((monotonic_now - start_time) * 1000).round

      # RubyLLM returns an Image object with .url or .data (base64)
      content = image.url.presence || image.data
      raise RequestError, "GPT Image returned no image data" unless content.present?

      {
        content: content,
        model: @model,
        input_tokens: prompt.length,
        output_tokens: 0,
        latency_ms: elapsed_ms,
        content_type: image.mime_type || "image/png"
      }
    rescue => e
      if e.message.include?("timeout") || e.message.include?("Timeout")
        raise TimeoutError, "GPT Image request timed out: #{e.message}"
      end
      raise RequestError, "GPT Image generation failed: #{e.message}"
    end

    # Build the chat, optionally with a per-task request timeout.
    #
    # ai_services.rb sets a global RubyLLM request_timeout of 30s, which suits short
    # interactive calls but sits INSIDE the latency distribution of the long
    # structural ones: measured curriculum_design latencies were 21.6s-29.7s
    # (median 26.7s) against that 30s limit, so calls timed out at roughly the rate
    # you would expect, then burned another 30s timing out the fallback model before
    # falling back to the generic template.
    #
    # RubyLLM.context clones the config for this call only, so a task that genuinely
    # needs longer does not widen the timeout for everything else. Configure it via
    # `request_timeout:` in Rails.application.config.ai_model_defaults.
    def build_chat(timeout)
      return RubyLLM.chat(model: @model) if timeout.blank?

      RubyLLM.context { |c| c.request_timeout = timeout }.chat(model: @model)
    end

    # Schema-constrained responses arrive as a parsed Hash/Array; everything else is
    # already a String. Normalise to a String so AiInteraction#response and every
    # downstream parser see the same thing regardless of how the call was made.
    def serialize_content(content)
      content.is_a?(Hash) || content.is_a?(Array) ? content.to_json : content
    end

    def monotonic_now
      Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end
  end
end
