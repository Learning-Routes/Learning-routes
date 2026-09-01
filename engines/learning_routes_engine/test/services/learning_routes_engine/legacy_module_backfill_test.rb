require "test_helper"

module LearningRoutesEngine
  class LegacyModuleBackfillTest < ActiveSupport::TestCase
    setup do
      ActiveRecord::Base.connection.execute <<~SQL
        ALTER TABLE learning_routes_engine_route_steps
        ALTER COLUMN route_module_id DROP NOT NULL
      SQL
      @user = create_test_user
      profile = LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoute.create!(learning_profile: profile, topic: "Legacy route")
    end

    test "groups legacy levels by first step order and makes the first non-empty group preview" do
      nv2_first = create_step(position: 0, level: :nv2, title: "Apply", ready: true)
      nv1_later = create_step(position: 1, level: :nv1, title: "Basics", ready: true)
      nv2_later = create_step(position: 2, level: :nv2, title: "Analyze", ready: true)
      nv3_last = create_step(position: 3, level: :nv3, title: "Create", ready: false)

      LegacyModuleBackfill.call(@route)

      modules = RouteModule.where(learning_route_id: @route.id).order(:position).to_a
      assert_equal 3, modules.size
      assert modules.first.access_preview?
      assert modules.drop(1).all?(&:access_locked?)
      assert_equal [[nv2_first.id, nv2_later.id], [nv1_later.id], [nv3_last.id]],
        modules.map { |route_module| RouteStep.where(route_module_id: route_module.id).order(:position).pluck(:id) }
      assert_equal %w[ready ready outlined], modules.map(&:generation_state)
      assert_equal %w[nv2 nv1 nv3], modules.map { |route_module| route_module.metadata.fetch("legacy_level") }
    end

    test "preserves step identity ordering progress and legacy level data" do
      completed_at = Time.current.change(usec: 0)
      first = create_step(position: 4, level: :nv1, title: "Completed", ready: true,
        status: :completed, completed_at: completed_at)
      second = create_step(position: 8, level: :nv3, title: "Waiting", ready: false,
        status: :locked, prerequisites: [first.id])
      quiz = Assessments::Assessment.create!(route_step: first, assessment_type: :step_quiz, passing_score: 70)
      attempt = BlockAttempt.create!(user: @user, route_step: first, section_index: 0,
        block_type: "multiple_choice", attempts: 2, correct: true, completed_at: completed_at)
      snapshot = RouteStep.where(id: [first.id, second.id]).order(:position).pluck(
        :id, :position, :level, :status, :completed_at, :prerequisites
      )

      LegacyModuleBackfill.call(@route)

      assert_equal snapshot, RouteStep.where(id: [first.id, second.id]).order(:position).pluck(
        :id, :position, :level, :status, :completed_at, :prerequisites
      )
      assert RouteStep.where(id: [first.id, second.id]).where.not(route_module_id: nil).all?
      assert_equal first.id, quiz.reload.route_step_id
      assert_equal [first.id, 2, true, completed_at],
        attempt.reload.attributes.values_at("route_step_id", "attempts", "correct", "completed_at")
    end

    test "records failed and in-progress generation conservatively" do
      failed_step = create_step(position: 0, level: :nv1, title: "Failed")
      @route.update!(generation_status: "failed")
      LegacyModuleBackfill.call(@route)
      assert RouteModule.find_by!(learning_route_id: @route.id).generation_failed?

      generating_route = LearningRoute.create!(learning_profile_id: @route.learning_profile_id,
        topic: "Generating route", generation_status: "generating")
      generating_step = RouteStep.create!(learning_route: generating_route, position: 0,
        level: :nv1, title: "Generating")
      RouteStep.where(id: generating_step.id).update_all(route_module_id: nil)
      LegacyModuleBackfill.call(generating_route)

      assert RouteModule.find_by!(learning_route_id: generating_route.id).generation_generating?
      assert_not_nil failed_step.reload.route_module_id
    end

    test "keeps one empty preview for an empty route" do
      LegacyModuleBackfill.call(@route)

      modules = RouteModule.where(learning_route_id: @route.id)
      assert_equal 1, modules.count
      assert modules.first.access_preview?
      assert modules.first.generation_outlined?
    end

    test "maps an unknown raw legacy level explicitly" do
      step = create_step(position: 0, level: :nv1, title: "Imported")
      RouteStep.where(id: step.id).update_all(level: 99)

      LegacyModuleBackfill.call(@route)

      route_module = RouteModule.find_by!(learning_route_id: @route.id)
      assert_equal "unknown:99", route_module.metadata.fetch("legacy_level")
      raw_level = ActiveRecord::Base.connection.select_value(
        RouteStep.sanitize_sql_array(["SELECT level FROM learning_routes_engine_route_steps WHERE id = ?", step.id])
      )
      assert_equal 99, raw_level
    end

    test "is idempotent after a complete backfill" do
      step = create_step(position: 0, level: :nv1, title: "Once")
      LegacyModuleBackfill.call(@route)
      module_ids = RouteModule.where(learning_route_id: @route.id).order(:position).pluck(:id)

      LegacyModuleBackfill.call(@route)

      assert_equal module_ids, RouteModule.where(learning_route_id: @route.id).order(:position).pluck(:id)
      assert_equal module_ids.first, step.reload.route_module_id
    end

    private

    def create_step(position:, level:, title:, ready: false, **attributes)
      step = RouteStep.create!({
        learning_route: @route,
        position: position,
        level: level,
        title: title,
        metadata: { "content_ready" => ready }
      }.merge(attributes))
      RouteStep.where(id: step.id).update_all(route_module_id: nil)
      step.reload
    end
  end
end
