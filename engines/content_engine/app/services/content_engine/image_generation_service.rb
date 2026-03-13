# frozen_string_literal: true

module ContentEngine
  class ImageGenerationService
    class GenerationError < StandardError; end

    # Cost tiers: quick_images (low) = ~$0.02, image_generation (medium) = ~$0.07
    PROMPT_PREFIX = "Educational illustration in a clean, modern flat design style. " \
      "Clear labels and annotations. Light neutral background. Professional color palette. " \
      "Suitable for a learning platform. The illustration shows: "

    MAX_IMAGES_PER_LESSON = 2

    def initialize(user:, step: nil, locale: "en")
      @user = user
      @step = step
      @locale = locale
    end

    # Generate an educational image from a description.
    #
    # @param image_description [String] the description / prompt basis
    # @param metadata [Hash] optional context: topic, style, importance
    # @return [Hash] { image_url:, cost_cents:, generation_time_ms: }
    def generate(image_description:, metadata: {})
      validate_cost_budget!

      task_type = determine_task_type(metadata)
      prompt = build_prompt(image_description, metadata)

      start_time = Process.clock_gettime(Process::CLOCK_MONOTONIC)

      client = AiOrchestrator::AiClient.new(
        model: "gpt-image-1",
        task_type: task_type,
        user: @user
      )

      result = client.chat(prompt: prompt)

      elapsed_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round

      raise GenerationError, "No image data returned" unless result[:content].present?

      image_url = resolve_image_url(result[:content], result[:content_type])
      cost_cents = AiOrchestrator::CostTracker.estimate_cost(model: "gpt-image-1")

      track_interaction!(prompt, image_url, result, cost_cents, elapsed_ms, task_type)

      {
        image_url: image_url,
        cost_cents: cost_cents,
        generation_time_ms: elapsed_ms
      }
    end

    # Check if we can still generate images for the current lesson step.
    def images_remaining_for_step
      return MAX_IMAGES_PER_LESSON unless @step

      parsed = @step.metadata&.dig("parsed_sections")
      return MAX_IMAGES_PER_LESSON unless parsed.is_a?(Array)

      existing_images = parsed.count { |s| s["type"] == "visual" && s["image_url"].present? }
      [MAX_IMAGES_PER_LESSON - existing_images, 0].max
    end

    private

    def validate_cost_budget!
      if AiOrchestrator::CostTracker.alert_exceeded?(user: @user)
        raise GenerationError, I18n.t(
          "content_engine.image_generation.cost_limit_reached",
          default: "Daily cost limit reached. Image generation skipped."
        )
      end
    end

    # First image of a lesson gets medium quality; subsequent images get low quality.
    def determine_task_type(metadata)
      importance = metadata[:importance]&.to_sym

      if importance == :high
        :image_generation # medium quality ~$0.07
      elsif importance == :low || images_remaining_for_step < MAX_IMAGES_PER_LESSON
        :quick_images # low quality ~$0.02
      else
        # First image → medium quality
        :image_generation
      end
    end

    def build_prompt(description, metadata)
      clean_desc = strip_markdown(description).truncate(500)
      topic_hint = metadata[:topic].present? ? " Topic: #{metadata[:topic]}." : ""
      locale_hint = @locale == "es" ? " Labels in Spanish." : ""

      "#{PROMPT_PREFIX}#{clean_desc}.#{topic_hint}#{locale_hint} No text overlays."
    end

    def strip_markdown(text)
      text.to_s
          .gsub(/```[\w]*\n.*?```/m, "")           # code blocks
          .gsub(/\*{1,3}([^*]+)\*{1,3}/, '\1')     # bold/italic
          .gsub(/\[([^\]]+)\]\([^)]+\)/, '\1')      # links → text
          .gsub(/^#+\s+/, "")                        # headings
          .gsub(/!\[[^\]]*\]\([^)]+\)/, "")          # image refs
          .gsub(/\n{2,}/, ". ")                      # paragraph breaks
          .strip
    end

    # Resolve base64 data to a data URI or keep the URL as-is.
    # ActiveStorage attachment is available as a future enhancement.
    def resolve_image_url(content, content_type)
      if content.start_with?("http")
        content
      else
        mime = content_type || "image/png"
        "data:#{mime};base64,#{content}"
      end
    end

    def track_interaction!(prompt, image_url, result, cost_cents, elapsed_ms, task_type)
      AiOrchestrator::AiInteraction.create!(
        user: @user,
        model: "gpt-image-1",
        task_type: task_type.to_s,
        prompt: prompt.truncate(500),
        status: :completed,
        response: image_url.truncate(500),
        input_tokens: result[:input_tokens] || 0,
        output_tokens: result[:output_tokens] || 0,
        latency_ms: elapsed_ms,
        cost_cents: cost_cents
      )
    end
  end
end
