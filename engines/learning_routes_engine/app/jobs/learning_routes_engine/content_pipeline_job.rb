module LearningRoutesEngine
  class ContentPipelineJob < ApplicationJob
    queue_as :default

    retry_on StandardError, wait: 10.seconds, attempts: 2

    def perform(route_step_id, options = {})
      # Eager-load the route/profile/user chain in one query. strict_loading_by_default
      # is on, so traversing these lazily raises in dev/test and logs a violation on
      # every run in production. StepQuizGenerationJob and MediaPrefetchJob already
      # carry this fix; this job was missed, and it dies here before reaching stage 1.
      @step = RouteStep.includes(learning_route: { learning_profile: :user }).find(route_step_id)
      @route = @step.learning_route
      @profile = @route&.learning_profile
      @user = @profile&.user
      @options = options.symbolize_keys
      # Callers now CLAIM the step (ContentPrefetcher.claim) before enqueuing, so
      # every early return here has to give that claim back. Without this the
      # step is left looking permanently in flight and nothing regenerates it.
      unless @step.preview_access?
        ContentPrefetcher.release([@step.id])
        return
      end

      # Idempotency: skip if content already fully generated
      if @step.metadata&.dig("content_ready")
        ContentPrefetcher.release([@step.id])
        return
      end

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

      # The lesson is readable the moment the text is parsed. Mark it ready here,
      # before the enrichment below.
      #
      # MediaPrefetchJob used to run inline (perform_now) between parsing and
      # mark_ready!, so the student watched a skeleton for the whole of image and
      # audio generation — six threads, three retries each — for a lesson whose text
      # was already sitting in the database. That is most of the eleven-minute wait.
      mark_ready!

      # Stage 5: quiz. Already async (StepQuizGenerationJob.perform_later); the
      # rescue stays because a failure here must not fail an otherwise good lesson.
      begin
        Rails.logger.info("[ContentPipeline] Stage 5: Quiz generation")
        stage_quiz_generation!
      rescue => e
        Rails.logger.error("[ContentPipeline] Stage 5 FAILED: #{e.class}: #{e.message}")
      end

      # Stages 3-4: media enrichment, now off the student's critical path. Results
      # are written into parsed_sections and show on the next render of the step.
      ContentEngine::MediaPrefetchJob.perform_later(@step.id, @options)
      Rails.logger.info("[ContentPipeline] Media prefetch enqueued for step #{route_step_id}")

      Rails.logger.info("[ContentPipelineJob] Pipeline complete for step #{route_step_id}")
    rescue => e
      Rails.logger.error("[ContentPipelineJob] Pipeline failed for step #{route_step_id}: #{e.message}")
      if @step
        # Count attempts so the controller can back off. Without this every page
        # refresh re-enqueued the same failing pipeline and re-paid for the same
        # failing AI calls, because `content_generating` is cleared here and the
        # controller treated "not generating" as "start it again".
        attempts = @step.metadata&.dig("content_attempts").to_i + 1

        @step.update!(metadata: (@step.metadata || {}).merge(
          "content_error" => e.message.truncate(500),
          "content_failed_at" => Time.current.iso8601,
          "content_attempts" => attempts,
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

      # CurriculumBrain stores per-step hints in step.metadata.exercise_types.
      # Pass them through so the content prompt can honor them (falls back to
      # the subject-family pool when empty).
      recommended_types = Array(@step.metadata&.dig("exercise_types")).join(", ").presence || "(none — use subject family pool)"

      # PromptBuilder auto-computes {{language_directive}} and {{bilingual_instructions}}
      # from locale + target_locale — no need to hand-roll a bilingual block here.
      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :lesson_content,
        variables: {
          # Pass content_locale explicitly. These helpers default to I18n.locale, which
          # inside a job is the process default (:en) rather than this route's language
          # — so a Spanish route was sending English titles into its own lesson prompt.
          topic: @step.localized_title(content_locale),
          description: @step.localized_description(content_locale).to_s,
          level: @profile.current_level,
          learning_style: Array(@profile.learning_style).join(", "),
          bloom_level: @step.bloom_level.to_s,
          route_topic: @route.localized_topic(content_locale),
          locale: content_locale,
          target_locale: target_locale.to_s,
          recommended_exercise_types: recommended_types
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

    def extract_markdown(raw)
      stripped = raw.gsub(/\A\s*```\w*\s*\n?/, "").gsub(/\n?\s*```\s*\z/, "").strip
      parsed = JSON.parse(stripped)
      parsed["content"] || parsed.values.find { |v| v.is_a?(String) && v.length > 100 } || raw
    rescue JSON::ParserError
      raw
    end
  end
end
