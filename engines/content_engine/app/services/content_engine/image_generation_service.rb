# frozen_string_literal: true

module ContentEngine
  class ImageGenerationService
    class GenerationError < StandardError; end

    PROMPT_PREFIX = "Educational illustration in a clean, modern flat design style. " \
      "Clear labels and annotations. Light neutral background. Professional color palette. " \
      "Suitable for a learning platform. The illustration shows: "

    def initialize(user:, step: nil, locale: "en")
      @user = user
      @step = step
      @locale = locale
    end

    # @param image_description [String]
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

      # Also store image_url on AiContent if step has one
      store_image_url_on_ai_content!(image_url) if @step

      track_interaction!(prompt, image_url, result, cost_cents, elapsed_ms, task_type)

      {
        image_url: image_url,
        cost_cents: cost_cents,
        generation_time_ms: elapsed_ms
      }
    end

    # How many more images can be generated for this step's lesson.
    def images_remaining_for_step
      max = self.class.max_images_per_lesson
      return max unless @step

      parsed = @step.metadata&.dig("parsed_sections")
      return max unless parsed.is_a?(Array)

      existing_images = parsed.count { |s| s["type"] == "visual" && s["image_url"].present? }
      [max - existing_images, 0].max
    end

    def self.max_images_per_lesson
      if Rails.application.config.respond_to?(:max_images_per_lesson)
        Rails.application.config.max_images_per_lesson
      else
        2
      end
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

    # First image of a lesson gets medium quality; subsequent get low quality.
    def determine_task_type(metadata)
      importance = metadata[:importance]&.to_sym

      if importance == :high
        :image_generation # medium quality ~$0.07
      elsif importance == :low || images_remaining_for_step < self.class.max_images_per_lesson
        :quick_images # low quality ~$0.02
      else
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

    # Save base64 to ActiveStorage when available, otherwise use data URI.
    # URL responses are returned as-is.
    def resolve_image_url(content, content_type)
      if content.start_with?("http")
        content
      else
        save_to_active_storage(content, content_type)
      end
    end

    def save_to_active_storage(base64_data, content_type)
      mime = content_type || "image/png"
      extension = mime.split("/").last.sub("jpeg", "jpg")

      # ActiveStorage requires the tables to be present
      if active_storage_available?
        blob = ActiveStorage::Blob.create_and_upload!(
          io: StringIO.new(Base64.decode64(base64_data)),
          filename: "ai_image_#{SecureRandom.hex(8)}.#{extension}",
          content_type: mime
        )
        Rails.application.routes.url_helpers.rails_blob_url(blob, only_path: true)
      else
        # Fallback: data URI (works without ActiveStorage)
        "data:#{mime};base64,#{base64_data}"
      end
    rescue => e
      Rails.logger.warn("[ImageGenerationService] ActiveStorage save failed, using data URI: #{e.message}")
      "data:#{mime};base64,#{base64_data}"
    end

    def active_storage_available?
      defined?(ActiveStorage::Blob) &&
        ActiveRecord::Base.connection.table_exists?("active_storage_blobs")
    rescue
      false
    end

    # Store the generated image URL on the AiContent record for the step.
    def store_image_url_on_ai_content!(image_url)
      ai_content = AiContent.where(route_step: @step).first
      return unless ai_content

      ai_content.update_column(:image_url, image_url) unless ai_content.image_url.present?
    rescue => e
      Rails.logger.warn("[ImageGenerationService] Could not update AiContent.image_url: #{e.message}")
    end

    def track_interaction!(prompt, image_url, result, cost_cents, elapsed_ms, task_type)
      AiOrchestrator::AiInteraction.create!(
        user: @user,
        model: "gpt-image-1",
        task_type: task_type.to_s,
        prompt: prompt.truncate(500),
        status: :completed,
        response: image_url.to_s.truncate(500),
        input_tokens: result[:input_tokens] || 0,
        output_tokens: result[:output_tokens] || 0,
        latency_ms: elapsed_ms,
        cost_cents: cost_cents
      )
    end
  end
end
