class WizardRouteGenerationJob < ApplicationJob
  queue_as :default

  retry_on ActiveRecord::Deadlocked, wait: 5.seconds, attempts: 3

  def perform(route_request_id)
    # Eager-load :user (strict_loading_by_default is on in production and test;
    # the job calls request.user multiple times — locale, profile creation,
    # CurriculumBrain — without this every access raises StrictLoadingViolationError).
    request = RouteRequest.includes(:user).find(route_request_id)

    # If request is already completed AND its route still exists, skip
    if request.completed?
      return if request.learning_route.present?
      # Route was deleted — allow re-generation
      request.update_column(:status, "generating")
    else
      request.update!(status: "generating")
    end

    begin
      user_locale = request.route_locale.presence || request.user.locale || "es"

      # Detect if the topic is a language-learning route
      raw_topic = (request.topics.presence || []).first
      topic_text = request.custom_topic.presence || raw_topic
      detected_target = LearningRoutesEngine::LanguageDetector.detect(topic_text)

      # For language routes: content in user's native language, target = language being learned
      target_locale = nil
      if detected_target && detected_target != user_locale
        target_locale = detected_target
      end

      # Try the AI-powered curriculum architect first; fall back to the
      # deterministic template path if anything goes wrong (parse error,
      # validation failure, API outage, rate limit). The template path is
      # always safe and keeps the route-create flow up even when the LLM
      # is misbehaving.
      brain_data = AiOrchestrator::CurriculumBrain.design(
        route_request: request,
        user: request.user,
        content_locale: user_locale,
        target_locale: target_locale
      )
      route_data = brain_data || generate_fallback_route(request, user_locale)
      module_outlines = module_outline(route_data)
      outlined_steps = module_outlines.flat_map { |route_module| route_module.fetch(:steps) }
      curriculum_source = brain_data ? "brain" : "template"
      Rails.logger.info("[WizardRouteGeneration] Curriculum source=#{curriculum_source} for request #{request.id} (#{outlined_steps.size} steps)")

      # Find or create the user's learning profile
      profile = LearningRoutesEngine::LearningProfile.find_or_create_by!(user: request.user) do |p|
        p.current_level = map_level(request.level)
        p.interests = request.topics
      end

      # Update profile with latest preferences
      profile.update!(
        current_level: map_level(request.level),
        interests: request.topics.presence || profile.interests,
        weekly_hours: request.weekly_hours || profile.weekly_hours,
        session_minutes: request.session_minutes || profile.session_minutes
      )

      # Extract learning style data (handle both symbol and string keys)
      style_result = request.learning_style_result || {}
      content_mix = style_result["content_mix"] || style_result[:content_mix] || { "audio" => 30, "text" => 35, "interactive" => 35 }
      dominant_style = style_result["dominant"] || style_result[:dominant]
      secondary_style = style_result["secondary"] || style_result[:secondary]

      route = nil
      ActiveRecord::Base.transaction do
        route = LearningRoutesEngine::LearningRoute.create!(
          learning_profile: profile,
          topic: route_data[:title],
          subject_area: route_data[:subtitle],
          locale: user_locale,
          target_locale: target_locale,
          translations: route_data[:translations],
          status: :active,
          total_steps: outlined_steps.length,
          generation_status: "completed",
          generated_at: Time.current,
          generation_params: {
            topics: request.topics,
            custom_topic: request.custom_topic,
            level: request.level,
            goals: request.goals,
            pace: request.pace,
            learning_style: dominant_style,
            weekly_hours: request.weekly_hours,
            session_minutes: request.session_minutes
          },
          content_preferences: {
            primary_style: dominant_style,
            secondary_style: secondary_style,
            content_mix: content_mix
          }
        )

        # Delivery format per step comes from the Brain when available;
        # we compute a VARK-based fallback distribution for template routes.
        template_delivery_formats = assign_delivery_formats(outlined_steps.length, content_mix)

        persisted_modules = module_outlines.each_with_index.map do |outline, module_index|
          attributes = {
            title: outline.fetch(:title), description: outline[:description],
            translations: outline[:translations] || {},
            access_state: module_index.zero? ? :preview : :locked,
            generation_state: module_index.zero? ? :generating : :outlined,
            metadata: { "outline_source" => curriculum_source }
          }
          if module_index.zero?
            preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: route.id, access_state: :preview)
            preview.update!(attributes)
            preview
          else
            LearningRoutesEngine::RouteModule.create!(
              attributes.merge(learning_route: route, position: module_index + 1)
            )
          end
        end

        created_steps = []
        module_outlines.each_with_index do |outline, module_index|
          outline.fetch(:steps).each do |step_data|
            index = created_steps.size
            route.route_steps.create!(
              route_module: persisted_modules.fetch(module_index),
              position: index,
              title: step_data[:label],
              description: step_data[:description].presence || Array(step_data[:topics]).join(", "),
              translations: step_data[:translations] || {},
              level: step_data[:level_enum] || :nv1,
              bloom_level: step_data[:bloom_level],
              content_type: (step_data[:content_type].presence || "lesson").to_sym,
              status: index == 0 ? :available : :locked,
              estimated_minutes: step_data[:estimated_minutes] || 30,
              delivery_format: step_data[:delivery_format].presence || template_delivery_formats[index] || "mixed",
              metadata: {
                "satellite_topics" => Array(step_data[:topics]),
                "exercise_types" => Array(step_data[:exercise_types]),
                "curriculum_source" => curriculum_source
              }
            ).tap { |step| created_steps << step }
          end
        end

        # Second pass: translate position-based prereq indices from the Brain
        # into the actual RouteStep IDs now that all rows exist.
        created_steps.each_with_index do |step, index|
          prereq_indices = Array(outlined_steps[index][:prerequisites])
          next if prereq_indices.empty?

          prereq_ids = prereq_indices.filter_map { |i| created_steps[i]&.id }
          step.update!(prerequisites: prereq_ids) if prereq_ids.any?
        end

        request.update!(status: "completed", learning_route: route)
      end

      # Quote the complete outline. Quoting is deliberately OUTSIDE the creation
      # transaction: a pricing-configuration problem must leave a usable route with
      # an explicit reason, not roll back the student's route. No checkout exists
      # yet, so an unquoted route is recoverable by re-quoting later.
      record_route_quote!(route)

      # Pre-generate content for the first 3 non-assessment steps
      pregenerate_content!(request.learning_route)

      begin
        Turbo::StreamsChannel.broadcast_replace_to(
          "route_request_#{request.id}",
          target: "generating-state",
          partial: "route_wizard/completed",
          locals: { route_request: request.reload }
        )
      rescue => broadcast_error
        Rails.logger.warn("[WizardRouteGeneration] Broadcast failed for request #{request.id}: #{broadcast_error.message}")
      end

    rescue ActiveRecord::Deadlocked
      raise # Let retry_on handle deadlocks
    rescue => e
      request.update!(status: "failed", error_message: e.message.truncate(500))
      Rails.logger.error("[WizardRouteGeneration] Failed for request #{request.id}: #{e.message}")

      begin
        Turbo::StreamsChannel.broadcast_replace_to(
          "route_request_#{request.id}",
          target: "generating-state",
          partial: "route_wizard/generation_failed",
          locals: { route_request: request, error: I18n.t("wizard.failed.desc") }
        )
      rescue => broadcast_error
        Rails.logger.warn("[WizardRouteGeneration] Error broadcast failed for request #{request.id}: #{broadcast_error.message}")
      end
    end
  end

  private

  def record_route_quote!(route)
    estimator = Commerce::EstimatorConfiguration.call(route: route)
    unless estimator.available?
      return block_quote!(route, estimator.reason, estimator.missing)
    end

    result = Commerce::RouteQuoteBuilder.call(
      route: route,
      estimator_configuration: estimator.configuration,
      fee_configuration: Rails.application.config.x.commerce_fee_configuration
    )
    return block_quote!(route, result.reason, result.missing) unless result.available?

    clear_quote_block!(route)
  rescue => e
    # Quoting must never destroy a generated route.
    Rails.logger.error("[WizardRouteGeneration] quoting failed for route #{route.id}: #{e.class}: #{e.message}")
    block_quote!(route, "quote_error", [])
  end

  def block_quote!(route, reason, missing)
    Rails.logger.warn(
      "[WizardRouteGeneration] route #{route.id} not quoted: #{reason} missing=#{Array(missing).join(',')}"
    )
    route.update!(generation_params: route.generation_params.merge("quote_blocked_reason" => reason))
  end

  def clear_quote_block!(route)
    route.update!(generation_params: route.generation_params.except("quote_blocked_reason"))
  end

  def module_outline(route_data)
    supplied = Array(route_data[:modules])
    return supplied if supplied.any?

    Array(route_data.fetch(:steps)).each_slice(3).with_index.map do |steps, index|
      first = steps.first
      {
        title: first[:label].presence || "Module #{index + 1}",
        description: first[:description].presence || Array(first[:topics]).join(", "),
        translations: first[:translations] || {},
        steps: steps
      }
    end
  end

  def pregenerate_content!(route)
    # Claim through ContentPrefetcher rather than update! + enqueue. The old version set
    # content_generating with a plain update! and fired all three jobs, which raced with
    # BackgroundContentGenerationJob 30s later — ContentPipelineJob only guards on
    # content_ready, so a step still in flight got a SECOND pipeline and a second paid
    # lesson_content call.
    #
    # BATCH SIZE: 3 steps, ~3¢ each measured (median 3¢, max 4¢ across 11 real calls)
    # => ~9-12¢ per route at creation. Median pipeline latency is ~20s and the prefetcher
    # allows 2 concurrently, so the first three lessons are ready in roughly 40s — long
    # before a student finishes step 1.
    step_ids = LearningRoutesEngine::ContentPrefetcher.pending_step_ids(route, limit: 3)
    enqueued = LearningRoutesEngine::ContentPrefetcher.prefetch(route, step_ids)
    preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: route.id, access_state: :preview)
    LearningRoutesEngine::RouteStep.where(route_module_id: preview.id, content_type: :assessment).find_each do |step|
      LearningRoutesEngine::AssessmentGenerationJob.perform_later(step.id)
    end

    Rails.logger.info(
      "[WizardRouteGeneration] Pre-generating #{enqueued.size} of #{step_ids.size} priority steps " \
      "for route #{route.id} (concurrency cap #{LearningRoutesEngine::ContentPrefetcher::MAX_IN_FLIGHT_PER_ROUTE})"
    )

    # Background generation for remaining steps (4+)
    LearningRoutesEngine::BackgroundContentGenerationJob.set(wait: 30.seconds).perform_later(route.id)
  rescue => e
    Rails.logger.error("[WizardRouteGeneration] Content pre-generation failed: #{e.message}")
  end

  def map_level(wizard_level)
    case wizard_level
    when "beginner", "basic" then "beginner"
    when "intermediate" then "intermediate"
    when "advanced" then "advanced"
    else "beginner"
    end
  end

  def level_to_enum(num)
    case num
    when 1, 2 then :nv1
    when 3 then :nv2
    when 4, 5 then :nv3
    else :nv1
    end
  end

  # Distribute delivery format types across steps based on learning style percentages.
  def assign_delivery_formats(step_count, content_mix)
    raw_audio = (content_mix["audio"] || content_mix[:audio] || 0).to_f
    raw_text  = (content_mix["text"]  || content_mix[:text]  || 0).to_f
    raw_interactive = (content_mix["interactive"] || content_mix[:interactive] || 0).to_f

    total = raw_audio + raw_text + raw_interactive
    total = 100.0 if total <= 0

    # Normalize to 100% then enforce minimums
    audio_pct = [(raw_audio / total * 100).round, 15].max
    text_pct  = [(raw_text / total * 100).round, 15].max
    interactive_pct = [(raw_interactive / total * 100).round, 10].max

    # Re-normalize so they sum to 100
    sum = audio_pct + text_pct + interactive_pct
    if sum > 100
      excess = sum - 100
      # Remove excess from the largest
      largest = [[:audio, audio_pct], [:text, text_pct], [:interactive, interactive_pct]].max_by(&:last)
      case largest.first
      when :audio then audio_pct -= excess
      when :text then text_pct -= excess
      when :interactive then interactive_pct -= excess
      end
    elsif sum < 100
      text_pct += (100 - sum)
    end

    pool = []
    pool += Array.new([(audio_pct / 100.0 * step_count).round, 1].max, "audio")
    pool += Array.new([(text_pct / 100.0 * step_count).round, 1].max, "text")
    pool += Array.new([(interactive_pct / 100.0 * step_count).round, 1].max, "interactive")

    pool << "text" while pool.length < step_count
    pool = pool.first(step_count)

    pool.shuffle
  end

  def generate_fallback_route(request, locale)
    # Get display topic — use i18n labels for the correct locale
    raw_topic = (request.topics.presence || []).first
    topic_i18n = raw_topic ? I18n.t("wizard.step0.topics.#{raw_topic}", locale: locale, default: raw_topic.humanize) : nil
    topic = topic_i18n || request.custom_topic || (locale == "es" ? "Aprendizaje General" : "General Learning")

    es_templates = step_templates_es(request.level)
    en_templates = step_templates_en(request.level)

    # Use session_minutes if available, otherwise infer from pace
    minutes_range = if request.session_minutes.present? && request.session_minutes > 0
      base = [request.session_minutes, 10].max
      ([(base * 0.7).to_i, 5].max..base)
    else
      case request.pace
      when "relaxed" then (40..55)
      when "steady" then (25..40)
      when "intensive" then (15..25)
      else (25..40)
      end
    end

    # Primary templates based on user locale
    primary = locale == "es" ? es_templates : en_templates
    secondary = locale == "es" ? en_templates : es_templates

    steps = primary.each_with_index.map do |template, i|
      alt = secondary[i] || template
      est_min = rand(minutes_range)

      {
        label: template[:label],
        level: template[:level],
        topics: template[:topics],
        estimated_minutes: est_min,
        level_enum: level_to_enum(template[:level]),
        translations: {
          "en" => { "title" => (locale == "en" ? template : alt)[:label], "description" => (locale == "en" ? template : alt)[:topics].join(", ") },
          "es" => { "title" => (locale == "es" ? template : alt)[:label], "description" => (locale == "es" ? template : alt)[:topics].join(", ") }
        }
      }
    end

    # Build route-level titles using correct locale
    en_topic = raw_topic ? I18n.t("wizard.step0.topics.#{raw_topic}", locale: :en, default: raw_topic.humanize) : (request.custom_topic || "General Learning")
    es_topic = raw_topic ? I18n.t("wizard.step0.topics.#{raw_topic}", locale: :es, default: raw_topic.humanize) : (request.custom_topic || "Aprendizaje General")

    en_title = "#{en_topic} Route"
    es_title = "Ruta de #{es_topic}"
    en_subtitle = "Personalized path · #{steps.length} stages · #{request.level} level"
    es_subtitle = "Camino personalizado · #{steps.length} etapas · nivel #{request.level}"

    {
      title: locale == "es" ? es_title : en_title,
      subtitle: locale == "es" ? es_subtitle : en_subtitle,
      translations: {
        "en" => { "title" => en_title, "subject_area" => en_subtitle },
        "es" => { "title" => es_title, "subject_area" => es_subtitle }
      },
      steps: steps
    }
  end

  def step_templates_es(level)
    case level
    when "beginner"
      [
        { label: "Fundamentos básicos", level: 1, topics: ["Conceptos clave", "Terminología", "Primeros pasos"] },
        { label: "Conceptos esenciales", level: 1, topics: ["Teoría básica", "Ejemplos simples", "Práctica guiada"] },
        { label: "Práctica inicial", level: 2, topics: ["Ejercicios básicos", "Repetición activa", "Auto-evaluación"] },
        { label: "Primeros proyectos", level: 2, topics: ["Proyecto guiado", "Aplicación real", "Revisión"] },
        { label: "Repaso y consolidación", level: 2, topics: ["Resumen", "Test de comprensión", "Siguiente nivel"] },
        { label: "Nivel intermedio inicial", level: 3, topics: ["Nuevos conceptos", "Complejidad media", "Retos"] },
        { label: "Aplicación práctica", level: 3, topics: ["Proyecto propio", "Resolución de problemas", "Feedback"] },
        { label: "Evaluación final", level: 3, topics: ["Examen integral", "Portfolio", "Certificación"] }
      ]
    when "basic"
      [
        { label: "Repaso de fundamentos", level: 1, topics: ["Revisión rápida", "Gaps de conocimiento", "Nivelación"] },
        { label: "Conceptos intermedios", level: 2, topics: ["Profundización", "Patrones comunes", "Mejores prácticas"] },
        { label: "Técnicas avanzadas", level: 2, topics: ["Optimización", "Casos especiales", "Herramientas"] },
        { label: "Proyecto aplicado", level: 3, topics: ["Diseño", "Implementación", "Testing"] },
        { label: "Especialización", level: 3, topics: ["Área de enfoque", "Técnicas específicas", "Comunidad"] },
        { label: "Dominio y práctica", level: 4, topics: ["Problemas complejos", "Mentoría", "Portfolio"] },
        { label: "Evaluación avanzada", level: 4, topics: ["Examen", "Proyecto final", "Certificación"] }
      ]
    when "intermediate"
      [
        { label: "Diagnóstico de nivel", level: 2, topics: ["Evaluación inicial", "Fortalezas", "Áreas de mejora"] },
        { label: "Técnicas avanzadas", level: 3, topics: ["Patrones avanzados", "Optimización", "Arquitectura"] },
        { label: "Casos complejos", level: 3, topics: ["Escenarios reales", "Debugging", "Performance"] },
        { label: "Especialización profunda", level: 4, topics: ["Nicho específico", "Investigación", "Innovación"] },
        { label: "Proyecto avanzado", level: 4, topics: ["Diseño complejo", "Full implementation", "Deploy"] },
        { label: "Liderazgo técnico", level: 4, topics: ["Code review", "Mentoría", "Documentación"] },
        { label: "Maestría", level: 5, topics: ["Estado del arte", "Contribución", "Enseñanza"] }
      ]
    when "advanced"
      [
        { label: "Estado del arte", level: 4, topics: ["Últimas tendencias", "Papers", "Herramientas nuevas"] },
        { label: "Investigación aplicada", level: 4, topics: ["Experimentación", "Benchmarks", "Análisis"] },
        { label: "Arquitectura experta", level: 5, topics: ["Diseño de sistemas", "Escalabilidad", "Trade-offs"] },
        { label: "Innovación", level: 5, topics: ["Nuevos enfoques", "Prototipado", "Validación"] },
        { label: "Contribución abierta", level: 5, topics: ["Open source", "Conferencias", "Publicaciones"] },
        { label: "Maestría y mentoría", level: 5, topics: ["Enseñanza", "Liderazgo", "Legado"] }
      ]
    else
      [
        { label: "Introducción", level: 1, topics: ["Conceptos básicos", "Terminología", "Primeros pasos"] },
        { label: "Práctica", level: 2, topics: ["Ejercicios", "Aplicación", "Revisión"] },
        { label: "Avance", level: 3, topics: ["Profundización", "Proyectos", "Evaluación"] }
      ]
    end
  end

  def step_templates_en(level)
    case level
    when "beginner"
      [
        { label: "Core Fundamentals", level: 1, topics: ["Key concepts", "Terminology", "First steps"] },
        { label: "Essential Concepts", level: 1, topics: ["Basic theory", "Simple examples", "Guided practice"] },
        { label: "Initial Practice", level: 2, topics: ["Basic exercises", "Active repetition", "Self-assessment"] },
        { label: "First Projects", level: 2, topics: ["Guided project", "Real-world application", "Review"] },
        { label: "Review & Consolidation", level: 2, topics: ["Summary", "Comprehension test", "Next level"] },
        { label: "Early Intermediate", level: 3, topics: ["New concepts", "Medium complexity", "Challenges"] },
        { label: "Practical Application", level: 3, topics: ["Own project", "Problem solving", "Feedback"] },
        { label: "Final Assessment", level: 3, topics: ["Comprehensive exam", "Portfolio", "Certification"] }
      ]
    when "basic"
      [
        { label: "Fundamentals Review", level: 1, topics: ["Quick review", "Knowledge gaps", "Leveling up"] },
        { label: "Intermediate Concepts", level: 2, topics: ["Deep dive", "Common patterns", "Best practices"] },
        { label: "Advanced Techniques", level: 2, topics: ["Optimization", "Special cases", "Tools"] },
        { label: "Applied Project", level: 3, topics: ["Design", "Implementation", "Testing"] },
        { label: "Specialization", level: 3, topics: ["Focus area", "Specific techniques", "Community"] },
        { label: "Mastery & Practice", level: 4, topics: ["Complex problems", "Mentoring", "Portfolio"] },
        { label: "Advanced Assessment", level: 4, topics: ["Exam", "Final project", "Certification"] }
      ]
    when "intermediate"
      [
        { label: "Level Diagnostic", level: 2, topics: ["Initial assessment", "Strengths", "Areas for improvement"] },
        { label: "Advanced Techniques", level: 3, topics: ["Advanced patterns", "Optimization", "Architecture"] },
        { label: "Complex Cases", level: 3, topics: ["Real scenarios", "Debugging", "Performance"] },
        { label: "Deep Specialization", level: 4, topics: ["Specific niche", "Research", "Innovation"] },
        { label: "Advanced Project", level: 4, topics: ["Complex design", "Full implementation", "Deploy"] },
        { label: "Technical Leadership", level: 4, topics: ["Code review", "Mentoring", "Documentation"] },
        { label: "Mastery", level: 5, topics: ["State of the art", "Contribution", "Teaching"] }
      ]
    when "advanced"
      [
        { label: "State of the Art", level: 4, topics: ["Latest trends", "Papers", "New tools"] },
        { label: "Applied Research", level: 4, topics: ["Experimentation", "Benchmarks", "Analysis"] },
        { label: "Expert Architecture", level: 5, topics: ["System design", "Scalability", "Trade-offs"] },
        { label: "Innovation", level: 5, topics: ["New approaches", "Prototyping", "Validation"] },
        { label: "Open Contribution", level: 5, topics: ["Open source", "Conferences", "Publications"] },
        { label: "Mastery & Mentoring", level: 5, topics: ["Teaching", "Leadership", "Legacy"] }
      ]
    else
      [
        { label: "Introduction", level: 1, topics: ["Basic concepts", "Terminology", "First steps"] },
        { label: "Practice", level: 2, topics: ["Exercises", "Application", "Review"] },
        { label: "Progress", level: 3, topics: ["Deep dive", "Projects", "Assessment"] }
      ]
    end
  end
end
