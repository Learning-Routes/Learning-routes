# frozen_string_literal: true

module LearningRoutesEngine
  # Deterministic procedural variation for anything a student sees in an order we chose.
  #
  # WHY THIS IS NOT `Array#shuffle`
  # ------------------------------
  # A bare `shuffle` in a view re-randomises on every render. A Turbo re-render or a
  # reload halfway through an exercise scrambles the board and destroys the placements
  # the student already made, and it makes the view non-deterministic in tests. What we
  # want is a permutation that is *fixed* for a given (student, block, attempt) and
  # *different* when any of those change.
  #
  # WHY IT LIVES IN learning_routes_engine
  # --------------------------------------
  # The seed is composed of a user, a RouteStep, a section index and an attempt count.
  # `RouteStep` and `BlockAttempt` are this engine's models, and both `content_engine`
  # and `assessments` already declare a dependency on this engine (the reverse is not
  # true), so the three callers named in WP-15 -- exam question order, flashcard order
  # and FSRS review order -- can all reach it from here without inverting a dependency.
  #
  # THE SEED
  # --------
  #   digest(user_id, route_step_id, section_index, attempt_number, salt)
  #
  # * `user_id`        -- two students never share a board.
  # * `route_step_id`  -- two blocks in the same lesson never share a board.
  # * `section_index`  -- two sections of the same step never share a board.
  # * `attempt_number` -- `BlockAttempt#attempts`, which the table already stores under a
  #                       unique index on (user, route_step, section_index). Nothing new
  #                       is persisted. A timestamp would change on every render and a
  #                       session value would not survive a logout or a second device --
  #                       both break "stable within an attempt".
  # * `salt`           -- "terms" and "definitions" from the SAME section must permute
  #                       independently, otherwise the two columns move together and the
  #                       positional shortcut survives.
  #
  # NIL SAFETY
  # ----------
  # A section can be rendered outside a step context (preview, agent reply) where there
  # is no `current_user` and possibly no step. Every part is stringified, so a nil part
  # contributes an empty segment and the permutation is still deterministic. This never
  # raises -- `submitBlock` already fails quiet in that context and this matches it.
  class BlockVariant
    # Namespaces the digest so a future caller that happens to pass the same integers
    # (an exam question order, say) does not collide with a lesson block's order.
    DIGEST_NAMESPACE = "learning_routes.block_variant.v1"

    # Field separator that cannot appear inside a UUID, an integer or a salt, so
    # ("ab", "c") and ("a", "bc") can never produce the same seed.
    SEPARATOR = "|"

    attr_reader :user_key, :step_key, :section_index, :attempt_number

    # `user` and `route_step` accept either the record or its id, so a caller that holds
    # only ids does not have to load a row to get an order.
    def self.for(user: nil, route_step: nil, section_index: 0, attempt_number: 0)
      new(
        user_key: id_of(user),
        step_key: id_of(route_step),
        section_index: section_index,
        attempt_number: attempt_number
      )
    end

    def self.id_of(subject)
      return nil if subject.nil?

      subject.respond_to?(:id) ? subject.id : subject
    end
    private_class_method :id_of

    def initialize(user_key: nil, step_key: nil, section_index: 0, attempt_number: 0)
      @user_key       = user_key
      @step_key       = step_key
      @section_index  = section_index
      @attempt_number = attempt_number
    end

    # The permutation itself: the indices 0...size in their new order.
    #
    #   order(3, salt: "terms") # => [2, 0, 1]
    #
    # Read it as "render original element 2 first, then 0, then 1".
    def order(size, salt: nil)
      size = size.to_i
      return [] if size <= 0

      (0...size).to_a.shuffle(random: Random.new(seed_for(salt)))
    end

    # The reordered collection, each element still carrying its ORIGINAL index.
    #
    #   permute(pairs, salt: "terms").each do |original_index, pair|
    #
    # The original index is the whole point: it is what goes into `data-term-index`,
    # `data-def-index`, `data-correct-def` and `data-option-index`, so the server's
    # index-identity grading keeps working against the stored array while the student
    # sees a shuffled board. A permutation that renumbered by position would erase
    # itself -- that was the WP-15 A2 defect.
    def permute(collection, salt: nil)
      items = Array(collection)
      order(items.size, salt: salt).map { |i| [i, items[i]] }
    end

    # 64 bits of the digest. Random accepts a Bignum seed, but 64 bits already exceeds
    # the size of the n! permutation space for any n we would ever render.
    def seed_for(salt)
      parts = [DIGEST_NAMESPACE, user_key, step_key, section_index, attempt_number, salt]
      Digest::SHA256.hexdigest(parts.map(&:to_s).join(SEPARATOR))[0, 16].to_i(16)
    end
  end
end
