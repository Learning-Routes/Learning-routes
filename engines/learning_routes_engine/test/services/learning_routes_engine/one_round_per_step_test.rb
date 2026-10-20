require "ostruct"
require "test_helper"

module LearningRoutesEngine
  # The owner's rule (20 Oct): one reinforcement round per step. A failed exam
  # on a step that already has a round reopens it instead of adding another
  # trio: its completed steps become available again, the unfinished ones stay
  # as they are, and the student's past attempts are kept. The 4 September cap
  # (one unfinished round per route) still applies first.
  class OneRoundPerStepTest < ActiveSupport::TestCase
    setup do
      @user = Core::User.create!(email: "round_#{SecureRandom.hex(4)}@example.com", password: "password123", name: "Round")
      profile = LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoute.create!(learning_profile: profile, topic: "Ruby", status: :active, current_step: 2,
                                     total_steps: 6, difficulty_progression: {})
      @steps = 6.times.map do |i|
        @route.route_steps.create!(position: i, title: "Step #{i + 1}", level: :nv1, bloom_level: 2,
                                   content_type: i.even? ? :lesson : :assessment, estimated_minutes: 20,
                                   status: i < 2 ? :completed : (i == 2 ? :available : :locked))
      end
    end

    test "failing the same step twice leaves exactly three reinforcement children" do
      exam = @steps[1]

      fail!(exam)
      finish_reinforcement!
      fail!(exam)

      assert_equal 3, children_of(exam).size
    end

    test "a different step gets its own trio" do
      fail!(@steps[1])
      finish_reinforcement!
      fail!(@steps[3])

      assert_equal 3, children_of(@steps[1]).size
      assert_equal 3, children_of(@steps[3]).size
    end

    test "on the second failure a completed reinforcement becomes available again, its attempts kept" do
      exam = @steps[1]
      fail!(exam)
      review, practice, reassessment = children_of(exam)
      review.update!(status: :completed, completed_at: Time.current)
      practice.update!(status: :completed, completed_at: Time.current)
      reassessment.update!(status: :in_progress)
      attempt = BlockAttempt.create!(user: @user, route_step: review, section_index: 0,
                                     block_type: "multiple_choice", attempts: 2, correct: true, completed_at: Time.current)

      fail!(exam)

      assert_equal %w[available available in_progress], [review, practice, reassessment].map { |s| s.reload.status }
      assert_nil review.completed_at
      assert BlockAttempt.exists?(attempt.id), "the past attempt is the student's work"
    end

    test "the cap still comes first: with the round unfinished a failure changes nothing" do
      exam = @steps[1]
      fail!(exam)
      before = children_of(exam).map { |s| [s.id, s.status] }

      fail!(@steps[3])

      assert_equal before, children_of(exam).map { |s| [s.id, s.status] }
      assert_empty children_of(@steps[3])
    end

    test "a step that already carries several old trios gets no new one and the older trios are left alone" do
      exam = @steps[1]
      fail!(exam)
      finish_reinforcement!
      # A second trio from before the rule, as production has: written straight in.
      first = children_of(exam)
      3.times do |i|
        @route.route_steps.create!(position: 50 + i, title: "Old #{i}", level: :nv1, bloom_level: 2, content_type: :lesson,
                                   status: :completed, completed_at: Time.current,
                                   metadata: { "reinforcement" => true, "triggering_step_id" => exam.id })
      end

      latest = children_of(exam) - first

      assert_no_difference -> { RouteStep.where(learning_route_id: @route.id).count } do
        fail!(exam)
      end
      assert first.all? { |s| s.reload.completed? }, "only the latest trio reopens; the first is left alone"
      assert latest.all? { |s| s.reload.available? }, "the latest trio reopens"
    end

    # Production's shape: every trio is inserted at current_step + 1, so a
    # student who failed the same step again without moving on has the NEWER
    # trio at LOWER positions. Most recent means created last, not placed last.
    test "the most recent trio reopens by creation, not by position" do
      exam = @steps[1]
      trio = ->(positions, created_at) do
        positions.map do |position|
          @route.route_steps.create!(position: position, title: "Refuerzo #{position}", level: :nv1, bloom_level: 2,
                                     content_type: :lesson, status: :completed, completed_at: created_at,
                                     created_at: created_at, metadata: { "reinforcement" => true, "triggering_step_id" => exam.id })
        end
      end
      older = trio.call([60, 61, 62], 2.days.ago)
      newer = trio.call([40, 41, 42], 1.day.ago)

      fail!(exam)

      assert newer.all? { |s| s.reload.available? }, "the newer trio's completed steps are available again"
      assert older.all? { |s| s.reload.completed? }, "the older trio is left completed"
    end

    private

    def fail!(step)
      assessment = Assessments::Assessment.find_or_create_by!(route_step: step, assessment_type: :level_up) { |a| a.passing_score = 70 }
      AdaptiveDifficulty.new(@route.reload, OpenStruct.new(score: 45, assessment_id: assessment.id)).adjust!
    end

    def finish_reinforcement!
      RouteStep.where(learning_route_id: @route.id).where("metadata->>'reinforcement' = 'true'")
               .update_all(status: RouteStep.statuses[:completed], completed_at: Time.current)
    end

    def children_of(step)
      steps = RouteStep.where(learning_route_id: @route.id, route_module_id: step.route_module_id).order(:position).to_a
      parents = ReinforcementParents.resolve(steps)
      steps.select { |s| parents[s.id]&.parent_id == step.id }
    end
  end
end
