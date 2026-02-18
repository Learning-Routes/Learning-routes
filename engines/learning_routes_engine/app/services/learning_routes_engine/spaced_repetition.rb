module LearningRoutesEngine
  class SpacedRepetition
    # FSRS v4 algorithm implementation
    # Reference: https://github.com/open-spaced-repetition/fsrs4anki
    #
    # 13 optimized parameters (w0-w12)
    PARAMS = [
      0.4,    # w0  - initial stability for Again
      0.6,    # w1  - initial stability for Hard
      2.4,    # w2  - initial stability for Good
      5.8,    # w3  - initial stability for Easy
      4.93,   # w4  - difficulty mean reversion speed
      0.94,   # w5  - difficulty mean reversion target
      0.86,   # w6  - stability increase base
      0.01,   # w7  - stability penalty for Again
      1.49,   # w8  - stability reward for Hard
      0.14,   # w9  - stability reward for Good
      0.94,   # w10 - stability reward for Easy
      2.18,   # w11 - hard penalty factor
      0.05    # w12 - easy bonus factor
    ].freeze

    # Rating constants
    AGAIN = 1
    HARD  = 2
    GOOD  = 3
    EASY  = 4

    # State constants (match Rails enum string values)
    NEW        = "fsrs_new"
    LEARNING   = "fsrs_learning"
    REVIEW     = "fsrs_review"
    RELEARNING = "fsrs_relearning"

    # Process a review and return updated card parameters
    def review(step, rating)
      now = Time.current
      rating = rating.to_i.clamp(AGAIN, EASY)

      if step.fsrs_state == NEW || step.fsrs_state.nil? || step.fsrs_reps.to_i == 0
        review_new_card(step, rating, now)
      else
        review_existing_card(step, rating, now)
      end
    end

    # Find completed steps due for review
    def due_reviews(route)
      route.route_steps.due_for_review
    end

    # Generate review step data for steps needing review
    def schedule_reviews(route)
      due_reviews(route).map do |step|
        {
          original_step_id: step.id,
          title: "Review: #{step.title}",
          description: "Spaced repetition review of #{step.title}",
          content_type: :review,
          level: step.level,
          estimated_minutes: [step.estimated_minutes.to_i / 2, 5].max,
          bloom_level: step.bloom_level,
          metadata: { review_of: step.id, retrievability: retrievability(step) }
        }
      end
    end

    # Calculate retrievability using power-law forgetting curve
    # R(t,S) = (1 + t/(9*S))^(-1)
    def retrievability(step)
      return 1.0 if step.fsrs_stability.to_f <= 0
      return 1.0 if step.fsrs_last_review_at.nil?

      elapsed = (Time.current - step.fsrs_last_review_at) / 1.day
      return 1.0 if elapsed <= 0

      (1.0 + elapsed / (9.0 * step.fsrs_stability)) ** -1
    end

    private

    def review_new_card(step, rating, now)
      stability = initial_stability(rating)
      difficulty = initial_difficulty(rating)

      state = rating == AGAIN ? RELEARNING : LEARNING
      state = REVIEW if rating >= GOOD

      interval = next_interval(stability)

      {
        fsrs_stability: stability,
        fsrs_difficulty: difficulty.clamp(1.0, 10.0),
        fsrs_reps: 1,
        fsrs_lapses: rating == AGAIN ? 1 : 0,
        fsrs_state: state,
        fsrs_last_review_at: now,
        fsrs_next_review_at: now + interval.days,
        fsrs_elapsed_days: 0.0,
        fsrs_scheduled_days: interval
      }
    end

    def review_existing_card(step, rating, now)
      elapsed = step.fsrs_last_review_at ? (now - step.fsrs_last_review_at) / 1.day : 0.0
      r = retrievability_at(elapsed, step.fsrs_stability.to_f)

      new_difficulty = next_difficulty(step.fsrs_difficulty.to_f, rating)
      new_stability = next_stability(step.fsrs_stability.to_f, new_difficulty, r, rating)

      new_state = if rating == AGAIN
                    RELEARNING
                  elsif step.fsrs_state == LEARNING || step.fsrs_state == RELEARNING
                    rating >= GOOD ? REVIEW : step.fsrs_state
                  else
                    REVIEW
                  end

      lapses = step.fsrs_lapses.to_i
      lapses += 1 if rating == AGAIN

      interval = next_interval(new_stability)

      {
        fsrs_stability: new_stability,
        fsrs_difficulty: new_difficulty.clamp(1.0, 10.0),
        fsrs_reps: step.fsrs_reps.to_i + 1,
        fsrs_lapses: lapses,
        fsrs_state: new_state,
        fsrs_last_review_at: now,
        fsrs_next_review_at: now + interval.days,
        fsrs_elapsed_days: elapsed,
        fsrs_scheduled_days: interval
      }
    end

    def initial_stability(rating)
      PARAMS[rating - 1] # w0-w3 map to Again(1)-Easy(4)
    end

    def initial_difficulty(rating)
      PARAMS[4] - (rating - 3) * PARAMS[5]
    end

    def next_difficulty(d, rating)
      mean_reversion = PARAMS[5] * (PARAMS[4] - d)
      d + mean_reversion - (rating - 3) * 0.5
    end

    def next_stability(s, d, r, rating)
      if rating == AGAIN
        # Lapse: stability decreases
        s * PARAMS[7] * (d ** -0.2) * ((s + 1).to_f ** 0.2 - 1)
      else
        # Success: stability increases
        factor = Math.exp(PARAMS[6]) *
                 (11 - d) *
                 (s ** -PARAMS[9]) *
                 (Math.exp((1 - r) * PARAMS[10]) - 1)

        factor *= PARAMS[11] if rating == HARD
        factor *= PARAMS[12] if rating == EASY

        s * (1 + factor)
      end
    end

    def next_interval(stability)
      # Target 90% retrievability
      desired_retention = 0.9
      interval = (9.0 * stability * (1.0 / desired_retention - 1)).round
      interval.clamp(1, 365)
    end

    def retrievability_at(elapsed_days, stability)
      return 1.0 if stability <= 0 || elapsed_days <= 0
      (1.0 + elapsed_days / (9.0 * stability)) ** -1
    end
  end
end
