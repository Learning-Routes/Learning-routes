module LearningRoutesEngine
  class ReinforcementGenerator
    class GenerationError < StandardError; end

    STEPS_PER_SEVERITY = { low: 3, medium: 4, high: 5 }.freeze

    def initialize(knowledge_gaps:, route:)
      @gaps = Array(knowledge_gaps)
      @route = route
      @user = route.learning_profile.user
      @profile = route.learning_profile
    end

    def generate!
      @gaps.map do |gap|
        generate_for_gap(gap)
      end
    end

    private

    def generate_for_gap(gap)
      step_count = STEPS_PER_SEVERITY[gap.severity.to_sym] || 3

      steps = call_ai(gap, step_count)
      steps = generic_fallback_steps(gap, step_count) if steps.empty?

      # Always append a re-assessment step
      steps << reassessment_step(gap)

      create_reinforcement_route!(gap, steps)
    end

    def call_ai(gap, step_count)
      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :reinforcement_generation,
        variables: {
          gap_topic: gap.topic,
          severity: gap.severity,
          gap_description: gap.description.to_s,
          user_level: @profile.current_level,
          learning_style: Array(@profile.learning_style).join(", "),
          route_topic: @route.topic,
          step_count: step_count.to_s
        },
        user: @user,
        async: false
      )

      return [] unless interaction.completed?

      parser = AiOrchestrator::ResponseParser.new(
        interaction.response,
        expected_format: :json,
        task_type: "reinforcement_generation"
      )
      parsed = parser.parse!
      normalize_steps(parsed["steps"] || [])
    rescue => e
      Rails.logger.error("[ReinforcementGenerator] AI call failed for gap '#{gap.topic}': #{e.message}")
      []
    end

    def normalize_steps(steps)
      steps.map do |step|
        {
          title: step["title"],
          description: step["description"],
          content_type: step["content_type"] || "lesson",
          estimated_minutes: step["estimated_minutes"] || 15,
          bloom_level: step["bloom_level"] || 2
        }
      end
    end

    def generic_fallback_steps(gap, step_count)
      steps = []

      steps << {
        title: "Review: #{gap.topic}",
        description: "Review the foundational concepts of #{gap.topic}",
        content_type: "lesson",
        estimated_minutes: 15,
        bloom_level: 1
      }

      steps << {
        title: "Deep Dive: #{gap.topic}",
        description: "Detailed explanation of #{gap.topic} with examples",
        content_type: "lesson",
        estimated_minutes: 20,
        bloom_level: 2
      }

      if step_count >= 4
        steps << {
          title: "Practice: #{gap.topic}",
          description: "Guided exercises to practice #{gap.topic}",
          content_type: "exercise",
          estimated_minutes: 20,
          bloom_level: 3
        }
      end

      if step_count >= 5
        steps << {
          title: "Apply: #{gap.topic}",
          description: "Apply #{gap.topic} concepts to solve problems",
          content_type: "exercise",
          estimated_minutes: 25,
          bloom_level: 4
        }
      end

      steps
    end

    def reassessment_step(gap)
      {
        title: "Re-Assessment: #{gap.topic}",
        description: "Verify understanding of #{gap.topic} after reinforcement",
        content_type: "assessment",
        estimated_minutes: 10,
        bloom_level: 3
      }
    end

    def create_reinforcement_route!(gap, steps)
      ReinforcementRoute.create!(
        learning_route: @route,
        knowledge_gap: gap,
        status: :active,
        steps: steps
      )
    end
  end
end
