module LearningRoutesEngine
  class ContentPipelineJob < ApplicationJob
    queue_as :default

    retry_on StandardError, wait: 10.seconds, attempts: 2

    # Pre-generate: first 2 concept sections + summary = 3 total
    MAX_AUDIO_PREGENERATE = 3

    def perform(route_step_id, options = {})
      @step = RouteStep.find(route_step_id)
      @route = @step.learning_route
      @profile = @route.learning_profile
      @user = @profile&.user
      @options = options.symbolize_keys

      # Idempotency: skip if content already fully generated
      return if @step.metadata&.dig("content_ready")

      mark_generating!

      # Stage 1: Text generation (REQUIRED)
      content = stage_text_generation!

      # Stage 2: Section parsing
      sections = stage_section_parsing!(content)

      # Stage 3: Image generation (optional, non-blocking)
      stage_image_generation!(content, sections)

      # Stage 4: Audio pre-generation (optional, non-blocking)
      stage_audio_pregeneration!(sections)

      # Stage 5: Step quiz generation
      stage_quiz_generation!

      # Stage 6: Mark as ready + broadcast
      mark_ready!

      Rails.logger.info("[ContentPipelineJob] Pipeline complete for step #{route_step_id}")
    rescue => e
      Rails.logger.error("[ContentPipelineJob] Pipeline failed for step #{route_step_id}: #{e.message}")
      if @step
        @step.update!(metadata: (@step.metadata || {}).merge(
          "content_error" => e.message.truncate(500),
          "content_failed_at" => Time.current.iso8601,
          "content_generating" => false
        ))
      end
      raise
    end

    private

    def mark_generating!
      @step.update!(metadata: (@step.metadata || {}).merge(
        "content_generating" => true,
        "pipeline_started_at" => Time.current.iso8601
      ))
    end

    # ── Stage 1: Text Generation ─────────────────────────────────────

    def stage_text_generation!
      # Check for existing content (either :text or :exercise depending on step type)
      target_type = @step.content_type_exercise? ? :exercise : :text
      existing = ContentEngine::AiContent.where(route_step: @step).by_type(target_type).first
      return existing if existing

      content_locale = @route.locale || @user&.locale || "en"
      target_locale = @route.target_locale

      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :lesson_content,
        variables: {
          topic: @step.localized_title,
          description: @step.localized_description.to_s,
          level: @profile.current_level,
          learning_style: Array(@profile.learning_style).join(", "),
          bloom_level: @step.bloom_level.to_s,
          route_topic: @route.localized_topic,
          locale: content_locale,
          content_locale: content_locale,
          target_locale: target_locale.to_s,
          is_language_route: target_locale.present?.to_s,
          bilingual_instructions: bilingual_prompt_section(content_locale, target_locale)
        },
        user: @user,
        async: false
      )

      unless interaction.completed?
        raise "Text generation failed: #{interaction.error_message}"
      end

      body = extract_markdown(interaction.response)

      # Use the step's content_type for the AiContent record so the controller
      # can find it with the correct scope (by_type(:text) or by_type(:exercise))
      ai_content_type = @step.content_type_exercise? ? :exercise : :text

      ContentEngine::AiContent.create!(
        route_step: @step,
        content_type: ai_content_type,
        body: body,
        ai_model: interaction.model,
        metadata: {
          learning_route_id: @route.id,
          ai_interaction_id: interaction.id,
          bloom_level: @step.bloom_level
        }
      )
    end

    # ── Stage 2: Section Parsing ─────────────────────────────────────

    def stage_section_parsing!(content)
      sections = ContentEngine::LessonSectionParser.call(
        content.body,
        metadata: @step.metadata || {},
        audio_url: content.audio_url
      )

      @step.update!(metadata: (@step.metadata || {}).merge(
        "content_generated" => true,
        "parsed_sections" => sections.map(&:as_json)
      ))

      sections
    end

    # ── Stage 3: Image Generation ────────────────────────────────────

    def stage_image_generation!(content, sections)
      visual_sections = sections.each_with_index.select { |s, _| s[:type].to_s == "visual" }
      return if visual_sections.empty?

      images_generated = 0

      visual_sections.each do |section, index|
        break if images_generated >= ContentEngine::ImageGenerationService.max_images_per_lesson

        # Skip if already has image
        next if section[:image_url].present?

        description = section[:image_description].presence || section[:body].presence || section[:alt_text]
        next if description.blank?

        begin
          result = generate_image(description, is_first_image: images_generated == 0)
          next unless result

          # Update the section in metadata
          update_section_image!(index, result[:url], result[:content_type])
          images_generated += 1
        rescue => e
          Rails.logger.warn("[ContentPipelineJob] Image generation failed for step #{@step.id}, section #{index}: #{e.message}")
        end
      end
    end

    def generate_image(description, is_first_image: false)
      locale = @route.locale || @user&.locale || "en"
      service = ContentEngine::ImageGenerationService.new(
        user: @user,
        step: @step,
        locale: locale
      )

      importance = is_first_image ? :high : :low
      result = service.generate(
        image_description: description,
        metadata: { topic: @route.localized_topic, importance: importance }
      )

      { url: result[:image_url], content_type: "image/png" }
    rescue => e
      Rails.logger.warn("[ContentPipelineJob] Image generation failed: #{e.message}")
      nil
    end

    def update_section_image!(section_index, image_url, content_type)
      metadata = @step.metadata || {}
      parsed = metadata["parsed_sections"]
      return unless parsed.is_a?(Array) && parsed[section_index]

      parsed[section_index]["image_url"] = image_url
      parsed[section_index]["image_content_type"] = content_type
      @step.update!(metadata: metadata.merge("parsed_sections" => parsed))
    end

    # ── Stage 4: Smart Audio Pre-generation ──────────────────────────
    #
    # Pre-generate audio for:
    # - First 2 concept sections (most important for learning)
    # - The summary section (users often replay summaries)
    # Total: up to 3 sections. Rest available on-demand.

    def stage_audio_pregeneration!(sections)
      locale = @route.locale || @user&.locale || "en"
      target_locale = @route.target_locale
      audio_count = 0

      # Select sections to pre-generate: first 2 concepts + first summary
      targets = select_audio_targets(sections)

      # Initialize audio_sections status tracking in metadata
      audio_sections = {}

      targets.each do |section, index|
        break if audio_count >= MAX_AUDIO_PREGENERATE

        next if section[:body].blank?
        next if ContentEngine::SectionAudioGenerator.cached(@step.id, index)

        audio_sections[index.to_s] = { "status" => "generating" }
        update_audio_sections_metadata!(audio_sections)

        begin
          result = ContentEngine::SectionAudioGenerator.generate!(
            @step.id, index, section[:body],
            locale: locale,
            target_locale: target_locale
          )
          audio_count += 1

          audio_sections[index.to_s] = {
            "status" => "ready",
            "url" => result[:audio_url],
            "duration" => result[:duration]
          }
        rescue => e
          Rails.logger.warn("[ContentPipelineJob] Audio generation failed for step #{@step.id}, section #{index}: #{e.message}")
          audio_sections[index.to_s] = { "status" => "failed" }
        end
      end

      # Mark remaining audio-eligible sections as pending
      sections.each_with_index do |section, index|
        next unless %w[concept summary visual example tip].include?(section[:type].to_s)
        next if audio_sections.key?(index.to_s)
        next if section[:body].blank?

        cached = ContentEngine::SectionAudioGenerator.cached(@step.id, index)
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

      update_audio_sections_metadata!(audio_sections)
    end

    def select_audio_targets(sections)
      concepts = []
      summary = nil

      sections.each_with_index do |section, index|
        type = section[:type].to_s
        if type == "concept" && concepts.size < 2
          concepts << [section, index]
        elsif type == "summary" && summary.nil?
          summary = [section, index]
        end
      end

      targets = concepts
      targets << summary if summary
      targets
    end

    def update_audio_sections_metadata!(audio_sections)
      metadata = @step.metadata || {}
      @step.update!(metadata: metadata.merge("audio_sections" => audio_sections))
    end

    # ── Stage 5: Quiz Generation ─────────────────────────────────────

    def stage_quiz_generation!
      return unless @step.requires_quiz?
      return if @step.metadata&.dig("step_quiz_generated")

      StepQuizGenerationJob.perform_later(@step.id)
    end

    # ── Stage 6: Mark Ready + Broadcast ──────────────────────────────

    def mark_ready!
      @step.update!(metadata: (@step.metadata || {}).merge(
        "content_ready" => true,
        "content_generating" => false,
        "generated_at" => Time.current.iso8601
      ))

      broadcast_content_ready!
    end

    def broadcast_content_ready!
      # The content-poll Stimulus controller polls every 3s and will pick up
      # the ready content on next cycle. No additional broadcast needed —
      # the polling mechanism is reliable and avoids the complexity of
      # rendering partials with instance variables from a job context.
      Rails.logger.info("[ContentPipelineJob] Content ready for step #{@step.id} — poll will pick it up")
    end

    def bilingual_prompt_section(content_locale, target_locale)
      return "" if target_locale.blank?

      <<~INSTRUCTIONS
        LANGUAGE LEARNING MODE: The student speaks #{content_locale} and is learning #{target_locale}.

        Rules for bilingual content:
        - Write explanations, instructions, and grammar rules in #{content_locale}
        - Write vocabulary, example sentences, dialogues, and exercises in #{target_locale}
        - Include pronunciation guides in parentheses for #{target_locale} words
        - Include translations in #{content_locale} after #{target_locale} examples
        - Knowledge checks should test #{target_locale} comprehension (translate this, choose the correct #{target_locale} word, etc.)
        - Audio sections should specify which language each part should be narrated in
        - Visual sections should show objects/scenes with labels in #{target_locale}
        - Use ## Ejemplo: sections for vocabulary lists, dialogues, and sentence practice in #{target_locale}
        - The lesson should feel like a language class, not a textbook
      INSTRUCTIONS
    end

    def extract_markdown(raw)
      stripped = raw.gsub(/\A\s*```\w*\s*\n?/, "").gsub(/\n?\s*```\s*\z/, "").strip
      parsed = JSON.parse(stripped)
      parsed["content"] || parsed.values.find { |v| v.is_a?(String) && v.length > 100 } || raw
    rescue JSON::ParserError
      raw
    end
  end
end
