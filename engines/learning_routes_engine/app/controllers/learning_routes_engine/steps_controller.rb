module LearningRoutesEngine
  class StepsController < ApplicationController
    before_action :authenticate_user!
    before_action :authorize_module_access!
    before_action :set_route_and_step
    before_action :ensure_step_accessible!, only: [:show]

    layout "learning"

    def show
      mark_in_progress_if_available!
      load_satisfied_sections!
      load_step_content
      prefetch_upcoming_steps!
      @study_session = find_or_start_study_session
      @notes = ContentEngine::UserNote.for_user(current_user).for_step(@step).ordered
      @progress = RouteProgressTracker.new(@route).progress_summary
    end

    # Turbo Frame polling endpoint — returns just the step content frame
    def content_status
      load_satisfied_sections!
      load_step_content
      render partial: "step_content_frame", layout: false
    end

    def complete
      # Gate on the interactive blocks BEFORE the quiz. The blocks are the lesson; the
      # quiz is the check on it, so being sent to the quiz with half the lesson skipped
      # is the wrong order. See WP10_DESIGN.md §3.
      outstanding = @step.outstanding_blocks_for(current_user)
      if outstanding.any?
        respond_to do |format|
          format.json do
            render json: { blocks_required: true, sections: outstanding.map { |b| b[:section_index] } },
                   status: :unprocessable_entity
          end
          format.turbo_stream do
            @outstanding_sections = outstanding.map { |b| b[:section_index] }
            render :show_outstanding_blocks
          end
          format.html do
            redirect_to route_step_path(@route, @step),
                        notice: t("learning_engine.blocks.required", count: outstanding.size)
          end
        end
        return
      end

      # Gate lesson/exercise steps behind a mini-quiz
      if @step.requires_quiz? && !@step.quiz_passed_by?(current_user)
        @step_quiz = @step.step_quiz
        if @step_quiz.nil?
          if generation_authorized? && !@step.metadata&.dig("step_quiz_generated")
            StepQuizGenerationJob.perform_later(@step.id)
          end
          @quiz_generating = true
        else
          @questions = @step_quiz.questions.order(:created_at)
        end

        respond_to do |format|
          format.json { render json: { quiz_required: true }, status: :unprocessable_entity }
          format.turbo_stream { render :show_quiz }
          format.html { redirect_to route_step_path(@route, @step), notice: t("learning_engine.step_quiz.required") }
        end
        return
      end

      # Gate assessment steps on the SAME decision `results#submit` asks for.
      #
      # Neither gate above can see an exam. `outstanding_blocks_for` is empty
      # because SectionResolver finds no AiContent for an assessment step, and
      # `requires_quiz?` is lesson/exercise only. So this action used to complete
      # an assessment step unconditionally — the side door WP-29 left open.
      if @step.content_type_assessment?
        decision = Assessments::StepAdvancement.decide_for(user: current_user, step: @step)
        return refuse_assessment_advance(decision) unless decision&.advance?
      end

      already_completed = @step.completed?

      tracker = RouteProgressTracker.new(@route)
      # Worst rating across this step's graded blocks (WP10_DESIGN.md §4). Released
      # attempts contribute nothing — see BlockAttempt#fsrs_rating.
      tracker.complete_step!(@step, rating: derived_fsrs_rating)
      @xp_result = tracker.xp_result
      finish_study_session!

      # Released and unanswerable advance the student while recording that they
      # did NOT pass. Written by the same helper `results#submit` uses, so the two
      # doors cannot drift apart.
      Assessments::StepAdvancement.record!(step: @step, decision: decision) if decision

      # Award lesson-specific XP (on top of step_complete XP from tracker).
      # NOT on a replay: `complete_step!` returns early for a step that is already
      # completed, but this ran anyway and `XpService.award` has no dedupe on
      # source_id, so every repeat POST paid again.
      lesson_xp = already_completed ? nil : award_lesson_xp!

      next_available = @route.route_steps
        .where("position > ?", @step.position)
        .where(status: [:available])
        .order(:position).first

      respond_to do |format|
        format.json do
          engagement = current_user.user_engagement
          render json: {
            xp_gained: (@xp_result&.dig(:xp_gained) || 0) + (lesson_xp || 0),
            total_xp: engagement&.total_xp || 0,
            level: engagement&.current_level || 1,
            leveled_up: @xp_result&.dig(:leveled_up) || false,
            streak: engagement&.current_streak || 0,
            route_completed: @route.completed?,
            next_step_id: next_available&.id,
            next_step_title: next_available&.localized_title,
            next_step_url: next_available ? route_step_path(@route, next_available) : nil,
            route_url: route_path(@route)
          }
        end
        format.html { redirect_to route_step_path(@route, next_available || @step), notice: t("flash.step_completed") }
        format.turbo_stream
      end
    end

    private

    # The third refusal in this action, in the same three formats as the block
    # gate and the quiz gate above, and for the same reason: a student who is
    # told nothing tries again, and a client that is told nothing celebrates.
    #
    # Two things can be missing, and they are not the same thing to say: there is
    # no scored attempt at all, or there is one and it did not earn a pass.
    def refuse_assessment_advance(decision)
      reason = decision.nil? ? :assessment_required : :assessment_not_passed
      message = t("learning_engine.assessment.gate.#{reason}",
                  attempts_left: decision&.attempts_left.to_i)

      respond_to do |format|
        format.json do
          render json: { assessment_required: true, reason: reason, message: message },
                 status: :unprocessable_entity
        end
        format.turbo_stream do
          @gate_message = message
          render :show_assessment_gate
        end
        format.html { redirect_to route_step_path(@route, @step), notice: message }
      end
    end

    def set_route_and_step
      @route = LearningRoute.includes(:learning_profile).find(params[:route_id])
      @step = @route.route_steps.find(params[:id])
    end

    def authorize_module_access!
      return if ModuleAccessPolicy.allowed?(user: current_user, route_id: params[:route_id], step_id: params[:id])

      head :forbidden
    end

    # May THIS request commission new paid AI work on this step?
    #
    # `authorize_module_access!` above is the READ gate and resolves through
    # `RoutePurchase.entitled?`, which counts `refunded` by design — the approved
    # spec defers post-refund read revocation and we are not narrowing it here.
    # But every enqueue in this controller was riding on that same read answer,
    # so a refunded route still commissioned `lesson_content`, the single most
    # expensive call the app makes, plus quiz, assessment and audio work.
    #
    # Memoized: `show` asks up to four times per request and this is two bounded
    # queries.
    def generation_authorized?
      return @generation_authorized if defined?(@generation_authorized)

      @generation_authorized = ModuleAccessPolicy.generation_allowed?(
        user: current_user, route_id: params[:route_id], step_id: params[:id]
      )
    end

    def ensure_step_accessible!
      if @step.locked?
        redirect_to learning_routes_engine.route_path(@route),
                    alert: t("flash.step_not_available")
        nil
      end
    end

    def mark_in_progress_if_available!
      @step.update!(status: :in_progress) if @step.available?
    end

    # Keep a 2-step-ahead buffer warm so the student never waits on the next
    # lesson. The naive read-check-write version had two problems:
    #  1. RACE — two concurrent show requests both see content_generating=false,
    #     both update, both enqueue → duplicate ContentPipelineJobs and AI cost.
    #  2. WASTE — `update!(metadata: merge(...))` rewrites the whole jsonb blob
    #     (which can hold parsed_sections of 100-300KB) just to flip a flag.
    # The fix: a single atomic SQL UPDATE with a WHERE clause that excludes
    # already-flagged rows, mutating only the one key via jsonb_set, and using
    # RETURNING to learn which rows we actually flipped. We enqueue jobs only
    # for those, so a concurrent request that lost the race enqueues nothing.
    # Keep a rolling window of generated content ahead of the student.
    #
    # DEPTH 2, unchanged and deliberate. The owner's requirement is "al llegar al 2 se
    # genera el 3" — depth 1. Depth 2 satisfies that with a step of margin, and generation
    # is now ~20s median where it used to be minutes, so a student who spends any real
    # time on a step always finds the next one ready. Deeper spends ~3¢ per lesson on
    # steps a student may never reach; routes run 8-18 steps and abandonment is real.
    #
    # The atomic claim that used to live inline here is now ContentPrefetcher — the same
    # mechanism the wizard and the background job use, so no path can double-enqueue a
    # step that is already in flight and pay for it twice.
    def prefetch_upcoming_steps!
      # Deliberately NOT gated on `generation_authorized?` for the step being
      # viewed. `pending_step_ids` returns preview-module steps only, so what it
      # prefetches is free content, free for everyone — gating it on the current
      # step would stop a refunded student warming the free preview, which the
      # policy explicitly protects.
      #
      # ContentPrefetcher's preview-only filter IS the spend boundary here. When
      # Task 8 widens it to `purchased` modules, this call must start filtering
      # by `ModuleAccessPolicy.generation_allowed?` per prefetched step, or a
      # refunded route silently resumes prefetching paid lessons two at a time.
      step_ids = ContentPrefetcher.pending_step_ids(
        @route, after_position: @step.position, limit: 2
      )
      return if step_ids.empty?

      ContentPrefetcher.prefetch(@route, step_ids)
    end

    # Worst FSRS rating across the step's graded block attempts, or GOOD when the step
    # produced no mastery signal at all. Worst-of rather than average: FSRS schedules the
    # step, and one block still hard means the step should come back sooner.
    def derived_fsrs_rating
      ratings = BlockAttempt.where(user: current_user, route_step: @step)
                            .filter_map(&:fsrs_rating)
      return SpacedRepetition::GOOD if ratings.empty?

      ratings.min
    end

    # Enqueue content generation, unless it is already running or has failed too
    # recently / too often.
    #
    # This used to be two copies of "if content_generating then wait, else enqueue".
    # ContentPipelineJob clears `content_generating` when it fails, so a failed step
    # looked exactly like a step that had never started: every refresh re-enqueued
    # the same failing pipeline and re-paid for the same failing AI calls, while the
    # student saw a skeleton and then a timeout. `content_error` was written but read
    # by nothing.
    #
    # Sets @content_generating / @content_failed / @content_error for the view.
    def request_content_generation!
      # A refunded route keeps every lesson it already has, but must not
      # commission a new one. Answered before the generating/backoff branches so
      # a step that was mid-flight at refund time also stops here rather than
      # polling a skeleton that will never resolve.
      unless generation_authorized?
        @content_unavailable = true
        return
      end

      metadata = @step.metadata || {}

      if metadata["content_generating"]
        @content_generating = true
        return
      end

      @content_error = metadata["content_error"]
      if @content_error.present? && !content_retry_due?(metadata)
        @content_failed = true
        @content_error_kind = metadata["content_error_kind"]
        @content_attempts = metadata["content_attempts"].to_i
        return
      end

      # ATOMIC CLAIM, not read-check-write.
      #
      # The `content_generating` check above is necessary but NOT sufficient:
      # that flag is only written when the job STARTS (ContentPipelineJob
      # #mark_generating!), and the frame polls `content_status` every 3s, which
      # re-runs this method. With the queue full at route-creation time,
      # enqueue-to-start is tens of seconds, so every poll inside that window saw
      # `content_generating` still false and enqueued another pipeline for the
      # same step. The job only guards on `content_ready`, so every duplicate ran
      # and every duplicate billed ~2.33¢.
      #
      # The claim is the same atomic UPDATE ... RETURNING that ContentPrefetcher
      # already uses for the prefetch path — the fix the comment above
      # `prefetch_upcoming_steps!` describes, finally applied to the path for the
      # step the student is actually looking at. Every access state is allowed
      # here: `authorize_module_access!` has already decided whether this user may
      # be on this step, and the prefetch path's preview-only rule is about
      # spending on steps NOBODY asked for.
      claimed = ContentPrefetcher.claim([@step.id], access_states: RouteModule.access_states.keys)
      if claimed.empty?
        # Another request won the race, or the step became ready between the read
        # above and now. Either way this request must not enqueue.
        @content_generating = true
        return
      end

      begin
        LearningRoutesEngine::ContentPipelineJob.perform_later(@step.id)
        @content_generating = true
      rescue => e
        # Never leave a claim standing that no job will ever consume — the step
        # would look permanently in flight and nothing would regenerate it.
        ContentPrefetcher.release([@step.id])
        Rails.logger.error("Content pipeline failed for step ##{@step.id}: #{e.message}")
        @content_failed = true
        @content_error = e.message
      end
    end

    # Exponential backoff, capped by a maximum attempt count. Both are configured in
    # config/initializers/content_generation.rb rather than inlined here.
    def content_retry_due?(metadata)
      attempts = metadata["content_attempts"].to_i
      return false if attempts >= Rails.application.config.content_generation_max_attempts

      failed_at = begin
        Time.zone.parse(metadata["content_failed_at"].to_s)
      rescue ArgumentError, TypeError
        nil
      end
      return true if failed_at.nil?

      backoff = Rails.application.config.content_generation_retry_backoff * (2**[attempts - 1, 0].max)
      Time.current >= failed_at + backoff
    end

    # Section indices this user has already satisfied, rendered by the view as
    # data-block-satisfied, plus the attempt count per section, which seeds
    # BlockVariant so the shuffle is stable within an attempt and new after a failure.
    #
    # ONE query for both, and only the two columns we read. Loaded here rather than
    # per-section so a 16-section lesson does not issue 16 queries, and plucked rather
    # than loaded so strict_loading has nothing to complain about.
    def load_satisfied_sections!
      rows = BlockAttempt.where(user: current_user, route_step: @step)
                         .pluck(:section_index, :attempts, :completed_at)

      @satisfied_sections   = rows.filter_map { |index, _attempts, done| index if done }.to_set
      @block_attempt_counts = rows.to_h { |index, attempts, _done| [index, attempts.to_i] }
    end

    def load_step_content
      # For audio delivery format, handle audio-specific content loading
      if @step.delivery_format == "audio"
        load_audio_content
        return
      end

      case @step.content_type
      when "lesson"
        @content = ContentEngine::AiContent.where(route_step: @step).by_type(:text).first
        unless @content
          # Use the pipeline job instead of the simple content generation job
          request_content_generation!
        end
        if @content
          # This branch used to parse on the fly and throw the result away, so the page
          # rendered from sections no other consumer could see. SectionResolver persists
          # what it parses — see that class for the three bugs it closes.
          @sections = ContentEngine::SectionResolver.call(@step).map(&:deep_symbolize_keys)
          @rendered_html = ContentEngine::MarkdownRenderer.render(@content.body)
        end
      when "exercise"
        @content = ContentEngine::AiContent.where(route_step: @step).by_type(:exercise).first
        unless @content
          request_content_generation!
        end
        @rendered_html = ContentEngine::MarkdownRenderer.render(@content.body) if @content
      when "assessment"
        @assessment = Assessments::Assessment.find_by(route_step: @step)
        if @assessment.nil? && generation_authorized?
          begin; LearningRoutesEngine::AssessmentGenerationJob.perform_later(@step.id); rescue => e; Rails.logger.error("Assessment generation failed for step ##{@step.id}: #{e.message}"); end
          @assessment_generating = true
        elsif @assessment.nil?
          @content_unavailable = true
        end
        if @assessment
          # Was `find_by(user:, assessment:)` — no score filter, no order, so an
          # ARBITRARY row. Once that row happened to be a scored one the page
          # showed the score ring and hid the only Start button, `failed_attempts`
          # could never reach RELEASE_AFTER, and the escape valve WP-29 built was
          # unreachable. WP-32 §2.
          @existing_result = Assessments::AssessmentResult.current_for(
            user: current_user, assessment: @assessment
          )
          # What the retake card says: how many attempts are left before the
          # valve opens, and whether it already has.
          @assessment_decision = Assessments::StepAdvancement.decide_for(
            user: current_user, step: @step
          )
        end
      when "review"
        @retrievability = SpacedRepetition.new.retrievability(@step)
        @review_steps = @route.route_steps.completed_steps.where.not(id: @step.id).order(:position).limit(20)
      end
    end

    # Load content for audio delivery format steps
    # Always loads text content as fallback so the lesson is viewable even if audio fails
    def load_audio_content
      @content = ContentEngine::AiContent.where(route_step: @step).by_type(:text).first

      # If no text content yet, generate it first via pipeline
      unless @content
        unless generation_authorized?
          @content_unavailable = true
          return
        end

        unless @step.metadata&.dig("content_generating")
          begin
            LearningRoutesEngine::ContentPipelineJob.perform_later(@step.id, { pregenerate_audio: true })
          rescue => e
            Rails.logger.error("Content pipeline failed for audio step ##{@step.id}: #{e.message}")
          end
        end
        @content_generating = true
        return
      end

      # Always parse sections/rendered_html so text fallback works
      if @content
        cached = @step.metadata&.dig("parsed_sections")
        if cached.is_a?(Array) && cached.any?
          @sections = cached.map(&:deep_symbolize_keys)
        else
          @sections = ContentEngine::LessonSectionParser.call(
            @content.body,
            metadata: @step.metadata || {},
            audio_url: @content.audio_url
          )
        end
        @rendered_html = ContentEngine::MarkdownRenderer.render(@content.body)
      end

      # If text content exists but audio hasn't been generated, trigger on-demand
      if @content.needs_audio? && generation_authorized?
        begin
          ContentEngine::AudioGenerationJob.perform_later(@step.id)
          @content.mark_audio_generating!
        rescue => e
          Rails.logger.error("Audio generation failed for step ##{@step.id}: #{e.message}")
        end
      end
    end

    def award_lesson_xp!
      return unless @step.content_type == "lesson"

      source = step_quiz_perfect? ? "lesson_perfect" : "lesson_complete"
      amount = XpService::XP_VALUES[source.to_sym] || 10

      XpService.award(current_user, amount, source, source_id: @step.id.to_s)
      amount
    rescue => e
      Rails.logger.warn("[StepsController] Lesson XP award failed: #{e.message}")
      nil
    end

    # Did this student actually answer every question of this step's quiz
    # correctly?
    #
    # This used to be `params[:quiz_results]` — a `correct` and a `total` the
    # BROWSER sent, compared to each other. Anyone could post
    # `{correct: 1, total: 1}` and be paid the perfect-lesson rate, and the
    # honest client sent them on every replay too. The step quiz persists an
    # AssessmentResult with a real score; that is the only copy worth reading.
    def step_quiz_perfect?
      quiz = Assessments::Assessment.find_by(route_step: @step, assessment_type: :step_quiz)
      return false if quiz.nil?

      Assessments::AssessmentResult
        .where(user: current_user, assessment: quiz)
        .where("score >= ?", 100)
        .exists?
    end

    def find_or_start_study_session
      Analytics::StudySession.for_user(current_user)
        .active
        .find_or_create_by!(route_step_id: @step.id) do |session|
          session.learning_route = @route
          session.started_at = Time.current
        end
    rescue ActiveRecord::RecordNotUnique
      retry
    end

    def finish_study_session!
      Analytics::StudySession.for_user(current_user)
        .active
        .where(route_step_id: @step.id)
        .find_each(&:finish!)
    end
  end
end
