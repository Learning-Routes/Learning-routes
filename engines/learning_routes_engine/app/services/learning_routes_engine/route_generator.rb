module LearningRoutesEngine
  class RouteGenerator
    class GenerationError < StandardError; end

    LEVEL_DISTRIBUTION = { nv1: 0.3, nv2: 0.4, nv3: 0.3 }.freeze
    DEFAULT_CONTENT_MIX = { "audio" => 30, "text" => 35, "interactive" => 35 }.freeze

    BLOOM_LEVELS = {
      nv1: [1, 2],     # Remember, Understand
      nv2: [3, 4],     # Apply, Analyze
      nv3: [5, 6]      # Evaluate, Create
    }.freeze

    def initialize(learning_profile)
      @profile = learning_profile
      @user = learning_profile.user
    end

    def generate!
      route = create_route_record!

      begin
        route.update!(generation_status: "generating")

        interaction = call_ai
        parsed = parse_response(interaction)

        create_steps!(route, parsed)
        finalize_route!(route, interaction)

        route
      rescue => e
        route.update!(generation_status: "failed", generation_params: route.generation_params.merge(error: e.message))
        raise GenerationError, "Route generation failed: #{e.message}"
      end
    end

    private

    def create_route_record!
      LearningRoute.create!(
        learning_profile: @profile,
        topic: @profile.interests&.first || "General Learning",
        subject_area: @profile.interests&.first,
        status: :draft,
        generation_status: "pending",
        generation_params: {
          level: @profile.current_level,
          learning_style: @profile.learning_style,
          goal: @profile.goal,
          interests: @profile.interests
        }
      )
    end

    def call_ai
      AiOrchestrator::Orchestrate.call(
        task_type: :route_generation,
        variables: {
          topic: @profile.interests&.join(", ") || "General",
          goal: @profile.goal || "Master the subject",
          timeline: "12 weeks",
          user_level: @profile.current_level,
          learning_style: Array(@profile.learning_style).join(", ")
        },
        user: @user,
        async: false
      )
    end

    def parse_response(interaction)
      raise GenerationError, "AI interaction failed: #{interaction.status}" unless interaction.completed?

      parser = AiOrchestrator::ResponseParser.new(
        interaction.response,
        expected_format: :json,
        task_type: "route_generation"
      )
      parser.parse!
    end

    def create_steps!(route, parsed)
      modules = parsed["modules"] || []
      raise GenerationError, "No modules returned from AI" if modules.empty?

      position = 0
      previous_step_id = nil

      ActiveRecord::Base.transaction do
        # Partition modules by level
        nv1_modules, nv2_modules, nv3_modules = partition_modules(modules)

        # Count total lesson/exercise steps to pre-assign delivery formats
        lesson_count = [nv1_modules, nv2_modules, nv3_modules].sum do |mods|
          mods.sum { |m| (m["lessons"] || []).size }
        end
        @delivery_formats = assign_delivery_formats(lesson_count)
        @format_index = 0

        # NV1: lessons → exercises → checkpoint quiz → level-up exam
        position, previous_step_id = create_level_steps!(route, nv1_modules, :nv1, position, previous_step_id)
        position, previous_step_id = create_assessment_step!(route, :nv1, "Level-Up Exam: NV1 → NV2", position, previous_step_id)

        # NV2: lessons → exercises → mind map review → practice test → level-up exam
        position, previous_step_id = create_level_steps!(route, nv2_modules, :nv2, position, previous_step_id)
        position, previous_step_id = create_review_step!(route, :nv2, "Mind Map Review: NV2 Concepts", position, previous_step_id)
        position, previous_step_id = create_assessment_step!(route, :nv2, "Level-Up Exam: NV2 → NV3", position, previous_step_id)

        # NV3: lessons → exercises → final exam → comprehensive review
        position, previous_step_id = create_level_steps!(route, nv3_modules, :nv3, position, previous_step_id)
        position, previous_step_id = create_assessment_step!(route, :nv3, "Final Exam", position, previous_step_id)
        _position, _previous_step_id = create_review_step!(route, :nv3, "Comprehensive Review", position, previous_step_id)

        route.update!(total_steps: route.route_steps.count)

        # Unlock the first step
        first_step = route.route_steps.order(:position).first
        first_step&.unlock!

        # Pre-generate audio for the first audio step
        first_audio_step = route.route_steps.where(delivery_format: "audio").order(:position).first
        if first_audio_step
          ContentEngine::AudioGenerationJob.perform_later(first_audio_step.id)
        end
      end
    end

    def partition_modules(modules)
      # If modules already have level tags, use them; otherwise split by ratio
      nv1 = modules.select { |m| m["level"] == "nv1" }
      nv2 = modules.select { |m| m["level"] == "nv2" }
      nv3 = modules.select { |m| m["level"] == "nv3" }

      if nv1.empty? && nv2.empty? && nv3.empty?
        total = modules.size
        nv1_count = (total * LEVEL_DISTRIBUTION[:nv1]).ceil
        nv2_count = (total * LEVEL_DISTRIBUTION[:nv2]).ceil
        nv3_count = total - nv1_count - nv2_count
        nv3_count = [nv3_count, 1].max

        nv1 = modules[0, nv1_count] || []
        nv2 = modules[nv1_count, nv2_count] || []
        nv3 = modules[nv1_count + nv2_count, nv3_count] || []
      end

      [nv1, nv2, nv3]
    end

    def create_level_steps!(route, modules, level, position, previous_step_id)
      bloom_range = BLOOM_LEVELS[level]

      modules.each do |mod|
        lessons = mod["lessons"] || []

        lessons.each do |lesson|
          content_type = map_content_type(lesson["type"])
          bloom = lesson["bloom_level"] || bloom_range.sample

          format = @delivery_formats[@format_index] || "text"
          @format_index += 1

          step = route.route_steps.create!(
            position: position,
            title: lesson["title"] || "#{mod['name']} - Lesson",
            description: lesson["description"] || mod["description"],
            level: level,
            content_type: content_type,
            status: :locked,
            estimated_minutes: lesson["estimated_minutes"] || 30,
            bloom_level: bloom,
            delivery_format: format,
            prerequisites: previous_step_id ? [previous_step_id] : [],
            metadata: { module_name: mod["name"] }
          )

          previous_step_id = step.id
          position += 1
        end

        # If module has an assessment, add it
        if mod["assessment"]
          step = route.route_steps.create!(
            position: position,
            title: mod["assessment"]["title"] || "#{mod['name']} - Quiz",
            description: mod["assessment"]["description"],
            level: level,
            content_type: :assessment,
            status: :locked,
            estimated_minutes: 20,
            bloom_level: mod["assessment"]["bloom_level"] || bloom_range.max,
            prerequisites: previous_step_id ? [previous_step_id] : [],
            metadata: { module_name: mod["name"], assessment_type: mod["assessment"]["type"] }
          )
          previous_step_id = step.id
          position += 1
        end
      end

      [position, previous_step_id]
    end

    def create_assessment_step!(route, level, title, position, previous_step_id)
      step = route.route_steps.create!(
        position: position,
        title: title,
        description: "Comprehensive assessment for #{level} level",
        level: level,
        content_type: :assessment,
        status: :locked,
        estimated_minutes: 30,
        bloom_level: BLOOM_LEVELS[level].max,
        prerequisites: previous_step_id ? [previous_step_id] : [],
        metadata: { assessment_type: "level_up_exam" }
      )

      [position + 1, step.id]
    end

    def create_review_step!(route, level, title, position, previous_step_id)
      step = route.route_steps.create!(
        position: position,
        title: title,
        description: "Review and consolidation of #{level} concepts",
        level: level,
        content_type: :review,
        status: :locked,
        estimated_minutes: 20,
        bloom_level: BLOOM_LEVELS[level].max,
        prerequisites: previous_step_id ? [previous_step_id] : [],
        metadata: { review_type: "consolidation" }
      )

      [position + 1, step.id]
    end

    def finalize_route!(route, interaction)
      route.update!(
        status: :active,
        generation_status: "completed",
        generated_at: Time.current,
        ai_interaction_id: interaction.id,
        ai_model_used: interaction.model
      )
    end

    # Distribute delivery formats across lesson steps using default content mix.
    # Ensures every route gets a mix of audio, text, and interactive steps.
    def assign_delivery_formats(step_count)
      return ["text"] if step_count <= 0

      mix = DEFAULT_CONTENT_MIX
      pool = []
      pool += Array.new([(mix["audio"] / 100.0 * step_count).round, 1].max, "audio")
      pool += Array.new([(mix["text"] / 100.0 * step_count).round, 1].max, "text")
      pool += Array.new([(mix["interactive"] / 100.0 * step_count).round, 1].max, "interactive")

      pool << "text" while pool.length < step_count
      pool = pool.first(step_count)
      pool.shuffle
    end

    def map_content_type(type_str)
      case type_str.to_s.downcase
      when "lesson", "reading", "video" then :lesson
      when "exercise", "project" then :exercise
      when "assessment", "quiz", "exam", "peer_review" then :assessment
      when "review" then :review
      else :lesson
      end
    end
  end
end
