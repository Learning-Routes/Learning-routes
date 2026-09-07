require "test_helper"
require "timeout"

# WP-32 §4 — the second of two fast drops on a drag-drop board was a 500.
#
# `BlockAttemptRecorder` created the student's attempt row with
# `find_or_create_by!(identity)`, under a model-level
# `validates :section_index, uniqueness: { scope: %i[user_id route_step_id] }`.
# Neither half is safe:
#
# There are two windows, and they raise DIFFERENT errors:
#
#   RecordNotUnique  both callers miss, both insert, the database refuses the
#                    second. Rails 7.1 taught `find_or_create_by` to retry its
#                    `find_by` on this one, so it was already survivable — the
#                    test below pins that, because this package changes how the
#                    row is created and must not lose it.
#
#   RecordInvalid    the uniqueness VALIDATION sees the row and raises before the
#                    database is ever asked. This is not a `RecordNotUnique`, so
#                    no framework retry covers it and the request is a 500 —
#                    WP-28's snapshot trap in a different file, an exception on a
#                    path whose only job is to record what the student did.
#
# `create_or_find_by!` always attempts the insert, so the second window stops
# being a microsecond-wide race and becomes EVERY repeat submission — which is
# what makes "two drops on the same block" below a real guard rather than a
# hopeful one. Remove the `rescue ActiveRecord::RecordInvalid` from
# BlockAttemptRecorder and that test 500s.
module LearningRoutesEngine
  class BlockAttemptIdentityRaceTest < ActionDispatch::IntegrationTest
    self.use_transactional_tests = false

    BA = LearningRoutesEngine::BlockAttempt
    EMAIL_PATTERN = "block-identity-race-%"

    SECTION = {
      "type" => "check", "question" => "¿Cuál?",
      "options" => [
        { "label" => "Correcta", "correct" => true },
        { "label" => "Incorrecta", "correct" => false }
      ]
    }.freeze
    PAYLOAD = { "option_index" => 1, "submission_complete" => true }.freeze

    setup do
      delete_race_records
      @user = Core::User.create!(
        name: "Dropper", email: "block-identity-race-#{SecureRandom.hex(4)}@example.test",
        password: "password123", password_confirmation: "password123",
        email_verified_at: Time.current, locale: "es"
      )
      profile = LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoute.create!(learning_profile: profile, topic: "Drops", locale: "es")
      preview = RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
      @step = @route.route_steps.create!(
        route_module: preview, title: "Tablero", position: 0, status: :in_progress,
        content_type: :lesson, level: :nv1, bloom_level: 1,
        metadata: { "parsed_sections" => [SECTION.deep_dup] }
      )
      post core.sign_in_path, params: { email: @user.email, password: "password123" }
    end

    teardown do
      delete_race_records
    end

    # The plain repeat, which is what every second drop on a board is. It must
    # stay a 2xx and one row — this is also what pins the `RecordInvalid` rescue,
    # because `create_or_find_by!` runs the uniqueness validation on every call.
    test "two drops on the same block answer 2xx and leave one row" do
      2.times do
        post_drop
        assert_response :success
      end

      assert_equal 1, BA.where(user: @user, route_step: @step, section_index: 0).count
    end

    # The database race. Deterministic: the recorder is held blocked on the unique
    # index by an uncommitted insert, and only then let through.
    test "a recorder that loses the insert race gets the existing row, not an exception" do
      outcome = Queue.new
      backend_pids = Queue.new
      thread = nil
      grading = BlockGrader.new(section: SECTION, payload: PAYLOAD).call

      BA.transaction do
        BA.insert!(
          { user_id: @user.id, route_step_id: @step.id, section_index: 0,
            block_type: "check", attempts: 0, payload: {},
            created_at: Time.current, updated_at: Time.current }
        )

        thread = Thread.new do
          ActiveRecord::Base.connection_pool.with_connection do |connection|
            backend_pids << connection.raw_connection.backend_pid
            begin
              outcome << BlockAttemptRecorder.call(
                user: @user, route_step: @step, section_index: 0,
                block_type: "check", payload: PAYLOAD, grading: grading, complete: true
              ).id
            rescue StandardError => error
              outcome << error
            end
          end
        end

        pid = Timeout.timeout(5) { backend_pids.pop }
        wait_until_lock_blocked(pid)
      end

      assert thread.join(10), "the losing recorder never finished"
      result = outcome.pop

      assert_not_kind_of StandardError, result,
        "the loser of the insert race raised: #{result.inspect}"
      assert_equal 1, BA.where(user: @user, route_step: @step, section_index: 0).count
    ensure
      thread&.kill if thread&.alive?
    end

    private

    def post_drop
      post learning_routes_engine.route_step_block_attempt_path(@route, @step, section_index: 0),
           params: { block: PAYLOAD }, as: :json
    end

    def wait_until_lock_blocked(pid)
      Timeout.timeout(5) do
        ActiveRecord::Base.uncached do
          loop do
            blocked = ActiveRecord::Base.connection.select_value(<<~SQL.squish).to_i
              SELECT COUNT(*) FROM pg_stat_activity
              WHERE pid = #{pid.to_i} AND cardinality(pg_blocking_pids(pid)) > 0
            SQL
            break if blocked == 1

            sleep 0.01
          end
        end
      end
    rescue Timeout::Error
      flunk "the second recorder never blocked on the unique index (pid #{pid})"
    end

    def delete_race_records
      users = Core::User.where("email LIKE ?", EMAIL_PATTERN)
      profiles = LearningProfile.where(user_id: users.select(:id))
      routes = LearningRoute.where(learning_profile_id: profiles.select(:id))
      steps = RouteStep.where(learning_route_id: routes.select(:id))
      BA.where(route_step_id: steps.select(:id)).delete_all
      Analytics::StudySession.where(route_step_id: steps.select(:id)).delete_all
      steps.delete_all
      routes.delete_all
      profiles.delete_all
      users.delete_all
    end
  end
end
