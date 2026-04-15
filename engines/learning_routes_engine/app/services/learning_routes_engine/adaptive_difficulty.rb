module LearningRoutesEngine
  class AdaptiveDifficulty
    SKIP_THRESHOLD = 90     # Score >= 90% → skip some steps
    REINFORCE_THRESHOLD = 60 # Score < 60% → insert reinforcement
    MAX_SKIP_RATIO = 0.3    # Skip at most 30% of remaining same-level steps

    # Real-time section-level difficulty for interactive lessons.
    # Returns :easy, :normal, or :hard based on recent performance.
    def self.current_difficulty(user:, step:)
      new_for_section(user: user, step: step).calculate_difficulty
    end

    # Whether difficulty should be adjusted based on recent pattern.
    def self.should_adjust?(user:, step:)
      new_for_section(user: user, step: step).needs_adjustment?
    end

    def self.new_for_section(user:, step:)
      SectionDifficulty.new(user: user, step: step)
    end

    # Inner class for section-level difficulty
    class SectionDifficulty
      # Consecutive failures that trigger easy mode
      FRUSTRATION_THRESHOLD = 2
      # Fast correct answers (seconds) that trigger hard mode
      SPEED_THRESHOLD = 5
      # History window
      HISTORY_SIZE = 5

      def initialize(user:, step:)
        @user = user
        @step = step
        @metadata = step.metadata || {}
      end

      def calculate_difficulty
        history = recent_answers
        return :normal if history.empty?

        consecutive_failures = count_consecutive_failures(history)
        fast_corrects = count_fast_corrects(history)

        if consecutive_failures >= FRUSTRATION_THRESHOLD
          :easy
        elsif fast_corrects >= 3 && all_recent_correct?(history)
          :hard
        else
          :normal
        end
      end

      def needs_adjustment?
        calculate_difficulty != :normal
      end

      private

      def recent_answers
        answers = @metadata.dig("check_history") || []
        answers.last(HISTORY_SIZE)
      end

      def count_consecutive_failures(history)
        count = 0
        history.reverse_each do |entry|
          break unless entry["correct"] == false
          count += 1
        end
        count
      end

      def count_fast_corrects(history)
        history.count { |e| e["correct"] == true && e["time_seconds"].to_f < SPEED_THRESHOLD }
      end

      def all_recent_correct?(history)
        last_three = history.last(3)
        last_three.length >= 3 && last_three.all? { |e| e["correct"] == true }
      end
    end

    def initialize(route, assessment_result)
      @route = route
      @result = assessment_result
      @score = extract_score
    end

    def adjust!
      if @score >= SKIP_THRESHOLD
        skip_ahead!
      elsif @score < REINFORCE_THRESHOLD
        insert_reinforcement!
      end
      # 60-90%: proceed normally, no adjustment needed

      record_progression!
      @route
    end

    private

    def extract_score
      if @result.respond_to?(:score)
        @result.score.to_f
      elsif @result.respond_to?(:[])
        (@result[:score] || @result["score"]).to_f
      else
        75.0 # Default to normal range
      end
    end

    def skip_ahead!
      current_level = current_assessment_level
      remaining = @route.route_steps
        .where(level: current_level, status: [:locked, :available])
        .where(content_type: [:lesson, :exercise])
        .order(:position)

      skip_count = (remaining.count * MAX_SKIP_RATIO).floor
      return if skip_count == 0

      steps_to_skip = remaining.limit(skip_count)
      steps_to_skip.each do |step|
        step.update!(
          status: :completed,
          completed_at: Time.current,
          metadata: step.metadata.merge(skipped: true, skip_reason: "high_score", score: @score)
        )
      end

      # Unlock the next available step
      @route.route_steps.locked.order(:position).first&.unlock_if_ready!
    end

    def insert_reinforcement!
      current_position = @route.current_step
      current_level = current_assessment_level

      reinforcement_steps = build_reinforcement_steps(current_level)
      return if reinforcement_steps.empty?

      shift = reinforcement_steps.size

      ActiveRecord::Base.transaction do
        steps_to_shift = RouteStep.where(learning_route_id: @route.id)
                                  .where("position > ?", current_position)

        # Two-step position shift to avoid unique constraint violation:
        # PostgreSQL checks unique constraints per-row during UPDATE,
        # so direct position + N can conflict with existing positions.
        # Step 1: Negate positions to make them all unique negatives
        steps_to_shift.update_all(Arel.sql("position = -position - 1000"))
        # Step 2: Set final positions from the negated values
        RouteStep.where(learning_route_id: @route.id)
                 .where("position < 0")
                 .update_all(["position = -(position + 1000) + ?", shift])

        # Insert reinforcement steps
        reinforcement_steps.each_with_index do |attrs, idx|
          @route.route_steps.create!(
            position: current_position + 1 + idx,
            title: attrs[:title],
            description: attrs[:description],
            level: current_level,
            content_type: attrs[:content_type],
            status: idx == 0 ? :available : :locked,
            estimated_minutes: attrs[:estimated_minutes],
            bloom_level: attrs[:bloom_level],
            prerequisites: [],
            metadata: { reinforcement: true, trigger_score: @score }
          )
        end

        @route.update!(total_steps: @route.route_steps.count)
      end
    end

    def build_reinforcement_steps(level)
      bloom_range = RouteGenerator::BLOOM_LEVELS[level.to_sym] || [1, 2]
      [
        { title: "Reinforcement: Review Key Concepts",
          description: "Review the concepts that need strengthening",
          content_type: :lesson, estimated_minutes: 20, bloom_level: bloom_range.first },
        { title: "Reinforcement: Guided Practice",
          description: "Practice exercises with additional guidance",
          content_type: :exercise, estimated_minutes: 25, bloom_level: bloom_range.first },
        { title: "Reinforcement: Re-Assessment",
          description: "Quick check to verify understanding",
          content_type: :assessment, estimated_minutes: 15, bloom_level: bloom_range.last }
      ]
    end

    def current_assessment_level
      step = @route.route_steps.find_by(position: @route.current_step)
      step&.level || :nv1
    end

    def record_progression!
      progression = @route.difficulty_progression || {}
      history = progression["history"] || []
      history << {
        score: @score,
        action: action_taken,
        timestamp: Time.current.iso8601,
        level: current_assessment_level.to_s
      }
      @route.update!(difficulty_progression: progression.merge("history" => history))
    end

    def action_taken
      if @score >= SKIP_THRESHOLD
        "skip_ahead"
      elsif @score < REINFORCE_THRESHOLD
        "reinforce"
      else
        "proceed"
      end
    end
  end
end
