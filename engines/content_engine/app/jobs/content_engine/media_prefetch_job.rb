# frozen_string_literal: true

module ContentEngine
  class MediaPrefetchJob < ApplicationJob
    queue_as :default

    # Max parallel threads for media generation
    MAX_THREADS = 6
    # Max retry attempts per media item
    MAX_RETRIES = 3

    def perform(route_step_id, options = {})
      @step = LearningRoutesEngine::RouteStep.find(route_step_id)
      @route = @step.learning_route
      @profile = @route.learning_profile
      @user = @profile&.user
      @options = options.symbolize_keys

      sections = @step.metadata&.dig("parsed_sections")
      return unless sections.is_a?(Array)

      # Identify media tasks
      tasks = build_media_tasks(sections)
      return if tasks.empty?

      # Track progress
      total = tasks.size
      completed = Concurrent::AtomicFixnum.new(0)
      results = Concurrent::Hash.new

      broadcast_progress(0, total)

      # Run tasks in parallel using thread pool
      tasks.each_slice(MAX_THREADS).flat_map do |batch|
        batch.map do |task|
          Thread.new do
            result = execute_with_retry(task)
            results[task[:key]] = result
            current = completed.increment
            broadcast_progress(current, total)
          rescue => e
            Rails.logger.error("[MediaPrefetchJob] Task #{task[:key]} failed: #{e.message}")
            results[task[:key]] = { status: "failed", error: e.message }
            completed.increment
          end
        end.each(&:join) # Wait for batch to complete before starting next
      end

      # Apply results to step metadata
      apply_results!(sections, results)

      # Log summary
      ready = results.count { |_, v| v[:status] == "ready" }
      failed = results.count { |_, v| v[:status] == "failed" }
      Rails.logger.info(
        "[MediaPrefetchJob] Complete for step #{route_step_id}: " \
        "#{ready}/#{total} ready, #{failed} failed"
      )
    end

    private

    def build_media_tasks(sections)
      tasks = []
      locale = @route.locale || @user&.locale || "en"
      target_locale = @route.target_locale

      sections.each_with_index do |section, index|
        type = section["type"].to_s

        # Image tasks for visual sections
        if type == "visual" && section["image_url"].blank?
          description = section["image_description"].presence || section["body"].presence
          if description.present?
            cache_key = content_hash("image", index, description)
            cached = Rails.cache.read(cache_key)
            if cached
              tasks << { key: "image_#{index}", type: :cached_image, index: index, cached: cached }
            else
              tasks << {
                key: "image_#{index}", type: :image, index: index,
                description: description, cache_key: cache_key
              }
            end
          end
        end

        # Audio tasks for audio-eligible sections (first 2 concepts + summary)
        if %w[concept summary].include?(type) && section["body"].present?
          cached_audio = SectionAudioGenerator.cached(@step.id, index)
          unless cached_audio
            tasks << {
              key: "audio_#{index}", type: :audio, index: index,
              body: section["body"], locale: locale, target_locale: target_locale
            }
          end
        end

        # Mermaid validation for sections containing mermaid code blocks
        body = section["body"].to_s
        if body.include?("```mermaid")
          tasks << { key: "mermaid_#{index}", type: :mermaid, index: index, body: body }
        end
      end

      tasks
    end

    def execute_with_retry(task)
      case task[:type]
      when :cached_image
        { status: "ready", url: task[:cached][:url], source: "cache" }
      when :image
        with_retry(task[:key]) { generate_image(task) }
      when :audio
        with_retry(task[:key]) { generate_audio(task) }
      when :mermaid
        validate_mermaid(task)
      end
    end

    def with_retry(task_key, &block)
      attempts = 0
      begin
        attempts += 1
        yield
      rescue => e
        if attempts < MAX_RETRIES
          wait = (2**attempts) * 1 # 2s, 4s, 8s exponential backoff
          Rails.logger.warn(
            "[MediaPrefetchJob] Retry #{attempts}/#{MAX_RETRIES} for #{task_key}: #{e.message}, waiting #{wait}s"
          )
          sleep(wait)
          retry
        end
        { status: "failed", error: e.message }
      end
    end

    def generate_image(task)
      service = ImageGenerationService.new(
        user: @user, step: @step,
        locale: @route.locale || "en"
      )

      is_first = task[:index] == first_visual_index
      result = service.generate(
        image_description: task[:description],
        metadata: { topic: @route.localized_topic, importance: is_first ? :high : :low }
      )

      # Cache with content hash (invalidates only when description changes)
      Rails.cache.write(task[:cache_key], { url: result[:image_url] }, expires_in: 7.days)

      { status: "ready", url: result[:image_url], source: "generated" }
    end

    def generate_audio(task)
      result = SectionAudioGenerator.generate!(
        @step.id, task[:index], task[:body],
        locale: task[:locale],
        target_locale: task[:target_locale]
      )

      { status: "ready", url: result[:audio_url], duration: result[:duration] }
    end

    def validate_mermaid(task)
      # Extract mermaid code blocks and validate syntax
      mermaid_blocks = task[:body].scan(/```mermaid\n(.*?)```/m).flatten
      valid_starts = %w[flowchart graph sequenceDiagram classDiagram stateDiagram erDiagram mindmap pie gitGraph timeline journey gantt]

      all_valid = mermaid_blocks.all? do |block|
        first_word = block.strip.lines.first.to_s.strip.split(/\s+/).first.to_s
        valid_starts.any? { |s| first_word.start_with?(s) }
      end

      { status: all_valid ? "ready" : "invalid", mermaid_count: mermaid_blocks.size }
    end

    def apply_results!(sections, results)
      metadata = @step.metadata || {}
      parsed = metadata["parsed_sections"]
      audio_sections = metadata["audio_sections"] || {}

      results.each do |key, result|
        type, index_str = key.split("_", 2)
        index = index_str.to_i

        case type
        when "image"
          if result[:status] == "ready" && parsed[index]
            parsed[index]["image_url"] = result[:url]
          elsif result[:status] == "failed" && parsed[index]
            # Fallback: decorative SVG placeholder
            parsed[index]["image_url"] = fallback_image_url
            parsed[index]["image_fallback"] = true
          end
        when "audio"
          if result[:status] == "ready"
            audio_sections[index.to_s] = {
              "status" => "ready",
              "url" => result[:url],
              "duration" => result[:duration]
            }
          elsif result[:status] == "failed"
            # Fallback: mark as failed, UI will hide player
            audio_sections[index.to_s] = { "status" => "failed" }
          end
        when "mermaid"
          if parsed[index] && result[:status] == "invalid"
            parsed[index]["mermaid_invalid"] = true
          end
        end
      end

      # Mark remaining audio-eligible sections as pending
      sections.each_with_index do |section, index|
        next unless %w[concept summary visual example tip].include?(section["type"].to_s)
        next if audio_sections.key?(index.to_s)
        next if section["body"].blank?

        cached = SectionAudioGenerator.cached(@step.id, index)
        if cached
          audio_sections[index.to_s] = {
            "status" => "ready",
            "url" => cached[:audio_url],
            "duration" => cached[:duration]
          }
        else
          audio_sections[index.to_s] = { "status" => "pending" }
        end
      end

      @step.update!(metadata: metadata.merge(
        "parsed_sections" => parsed,
        "audio_sections" => audio_sections,
        "media_prefetch_completed_at" => Time.current.iso8601
      ))
    end

    def broadcast_progress(completed, total)
      Turbo::StreamsChannel.broadcast_replace_to(
        "step_content_#{@step.id}",
        target: "media_progress_#{@step.id}",
        html: render_progress_html(completed, total)
      )
    rescue => e
      # Non-critical: broadcast failure should not stop media generation
      Rails.logger.debug("[MediaPrefetchJob] Broadcast failed: #{e.message}")
    end

    def render_progress_html(completed, total)
      pct = total > 0 ? ((completed.to_f / total) * 100).round : 0
      "<div id=\"media_progress_#{@step.id}\" class=\"text-sm text-gray-500\">" \
        "Media assets: #{completed}/#{total} ready (#{pct}%)" \
      "</div>"
    end

    def content_hash(type, index, content)
      digest = Digest::SHA256.hexdigest("#{type}:#{index}:#{content}")
      "media_prefetch:#{@step.id}:#{digest}"
    end

    def first_visual_index
      sections = @step.metadata&.dig("parsed_sections") || []
      sections.index { |s| s["type"] == "visual" } || 0
    end

    def fallback_image_url
      # Simple SVG data URI as decorative placeholder
      svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">' \
            '<rect width="400" height="300" fill="#F5F1EB" rx="14"/>' \
            '<text x="200" y="150" text-anchor="middle" fill="#2C261E" font-family="sans-serif" font-size="14" opacity="0.5">' \
            'Image unavailable</text></svg>'
      "data:image/svg+xml;base64,#{Base64.strict_encode64(svg)}"
    end
  end
end
