class WizardRouteGenerationJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: 5.seconds, attempts: 2

  def perform(route_request_id)
    request = RouteRequest.find(route_request_id)
    return if request.completed?

    request.update!(status: "generating")

    begin
      user_locale = request.user.locale || "en"
      route_data = generate_fallback_route(request, user_locale)

      # Find or create the user's learning profile
      profile = LearningRoutesEngine::LearningProfile.find_or_create_by!(user: request.user) do |p|
        p.current_level = map_level(request.level)
        p.interests = request.topics
      end

      # Extract learning style data
      style_result = request.learning_style_result || {}
      content_mix = style_result["content_mix"] || { "video" => 25, "audio" => 25, "text" => 25, "interactive" => 25 }

      ActiveRecord::Base.transaction do
        route = LearningRoutesEngine::LearningRoute.create!(
          learning_profile: profile,
          topic: route_data[:title],
          subject_area: route_data[:subtitle],
          locale: user_locale,
          translations: route_data[:translations],
          status: :active,
          total_steps: route_data[:steps].length,
          generation_status: "completed",
          generated_at: Time.current,
          generation_params: {
            topics: request.topics,
            custom_topic: request.custom_topic,
            level: request.level,
            goals: request.goals,
            pace: request.pace,
            learning_style: style_result["dominant"]
          },
          content_preferences: {
            primary_style: style_result["dominant"],
            secondary_style: style_result["secondary"],
            content_mix: content_mix
          }
        )

        # Assign delivery formats based on learning style scores
        delivery_formats = assign_delivery_formats(route_data[:steps].length, content_mix)

        route_data[:steps].each_with_index do |step_data, index|
          route.route_steps.create!(
            position: index,
            title: step_data[:label],
            description: step_data[:topics].join(", "),
            translations: step_data[:translations],
            level: step_data[:level_enum] || :nv1,
            content_type: :lesson,
            status: index == 0 ? :available : :locked,
            estimated_minutes: step_data[:estimated_minutes] || 30,
            delivery_format: delivery_formats[index] || "mixed",
            metadata: { satellite_topics: step_data[:topics] }
          )
        end

        request.update!(status: "completed", learning_route: route)
      end

      Turbo::StreamsChannel.broadcast_replace_to(
        "route_request_#{request.id}",
        target: "generating-state",
        partial: "route_wizard/completed",
        locals: { route_request: request.reload }
      )

    rescue => e
      request.update!(status: "failed", error_message: e.message)
      Rails.logger.error("[WizardRouteGeneration] Failed for request #{request.id}: #{e.message}")

      Turbo::StreamsChannel.broadcast_replace_to(
        "route_request_#{request.id}",
        target: "generating-state",
        partial: "route_wizard/generation_failed",
        locals: { route_request: request, error: e.message }
      )
    end
  end

  private

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

  # Distribute delivery format types across steps based on learning style percentages
  def assign_delivery_formats(step_count, content_mix)
    video_pct = (content_mix["video"] || content_mix[:video] || 25).to_f
    audio_pct = (content_mix["audio"] || content_mix[:audio] || 25).to_f
    text_pct = (content_mix["text"] || content_mix[:text] || 25).to_f
    interactive_pct = (content_mix["interactive"] || content_mix[:interactive] || 25).to_f

    pool = []
    pool += Array.new((video_pct / 100.0 * step_count).round, "video")
    pool += Array.new((audio_pct / 100.0 * step_count).round, "audio")
    pool += Array.new((text_pct / 100.0 * step_count).round, "text")
    pool += Array.new((interactive_pct / 100.0 * step_count).round, "interactive")

    # Fill remainder with "mixed"
    pool << "mixed" while pool.length < step_count
    # Trim excess
    pool = pool.first(step_count)

    pool.shuffle
  end

  def generate_fallback_route(request, locale)
    topic = request.topic_display.first || (locale == "es" ? "Aprendizaje General" : "General Learning")

    es_templates = step_templates_es(request.level)
    en_templates = step_templates_en(request.level)

    minutes_range = case request.pace
    when "relaxed" then (40..55)
    when "steady" then (25..40)
    when "intensive" then (15..25)
    else (25..40)
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

    # Build route-level titles
    en_title = locale == "en" ? "#{topic} Route" : "#{topic} Route"
    es_title = locale == "es" ? "Ruta de #{topic}" : "Ruta de #{topic}"
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
