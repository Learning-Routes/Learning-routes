module LearningRoutesEngine
  class ContentPipelineJob < ApplicationJob
    queue_as :default

    retry_on StandardError, wait: 10.seconds, attempts: 2

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
      Rails.logger.info("[ContentPipeline] Stage 1: Text generation for step #{route_step_id}")
      content = stage_text_generation!
      Rails.logger.info("[ContentPipeline] Stage 1 complete: #{content.body.length} chars")

      # Stage 2: Section parsing
      Rails.logger.info("[ContentPipeline] Stage 2: Section parsing")
      sections = stage_section_parsing!(content)
      section_types = sections.map { |s| s[:type] }.tally
      Rails.logger.info("[ContentPipeline] Stage 2 complete: #{sections.size} sections (#{section_types})")

      # Stages 3-4: Parallel media generation (images, audio, mermaid validation)
      begin
        Rails.logger.info("[ContentPipeline] Stages 3-4: Parallel media prefetch")
        ContentEngine::MediaPrefetchJob.perform_now(@step.id, @options)
        Rails.logger.info("[ContentPipeline] Stages 3-4 complete")
      rescue => e
        Rails.logger.error("[ContentPipeline] Stages 3-4 FAILED: #{e.class}: #{e.message}\n#{e.backtrace.first(5).join("\n")}")
      end

      # Stage 5: Step quiz generation
      begin
        Rails.logger.info("[ContentPipeline] Stage 5: Quiz generation")
        stage_quiz_generation!
        Rails.logger.info("[ContentPipeline] Stage 5 complete")
      rescue => e
        Rails.logger.error("[ContentPipeline] Stage 5 FAILED: #{e.class}: #{e.message}\n#{e.backtrace.first(5).join("\n")}")
      end

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
