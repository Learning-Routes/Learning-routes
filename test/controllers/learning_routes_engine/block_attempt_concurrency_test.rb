require "test_helper"
require "timeout"

class LearningRoutesEngine::BlockAttemptConcurrencyTest < ActionDispatch::IntegrationTest
  self.use_transactional_tests = false

  BA = LearningRoutesEngine::BlockAttempt
  SECTION = {
    "type" => "check", "question" => "¿Cuál?",
    "options" => [
      { "label" => "Correcta", "correct" => true },
      { "label" => "Incorrecta", "correct" => false }
    ]
  }.freeze
  PAYLOAD = { "option_index" => 1, "submission_complete" => true }.freeze

  def setup
    assert_equal "PostgreSQL", ActiveRecord::Base.connection.adapter_name

    @user = Core::User.create!(
      name: "Concurrent Blocks", email: "concurrent-blocks-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, locale: "es"
    )
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "AWS", locale: "es", status: :active
    )
    @step = @route.route_steps.create!(
      title: "EC2", position: 0, status: :available, content_type: "lesson",
      delivery_format: "text", level: 1, bloom_level: 1,
      metadata: { "parsed_sections" => [SECTION.deep_dup] }
    )
    @attempt = BA.create!(
      user: @user, route_step: @step, section_index: 0, block_type: "check"
    )
  end

  def teardown
    BA.where(user_id: @user.id).delete_all
    LearningRoutesEngine::RouteStep.where(learning_route_id: @route.id).delete_all
    LearningRoutesEngine::LearningRoute.where(id: @route.id).delete_all
    LearningRoutesEngine::LearningProfile.where(id: @profile.id).delete_all
    Core::User.where(id: @user.id).delete_all
    I18n.locale = I18n.default_locale
    super
  end

  test "overlapping completed submissions increment serially and release at three" do
    recorder = LearningRoutesEngine::BlockAttemptRecorder
    grading = LearningRoutesEngine::BlockGrader.new(section: SECTION, payload: PAYLOAD).call
    started = Queue.new
    backend_pids = Queue.new
    threads = []

    BA.transaction do
      BA.lock.find(@attempt.id)

      threads = 3.times.map do
        Thread.new do
          ActiveRecord::Base.connection_pool.with_connection do |connection|
            backend_pids << connection.raw_connection.backend_pid
            started << true
            recorder.call(
              user: @user, route_step: @step, section_index: 0,
              block_type: "check", payload: PAYLOAD, grading: grading, complete: true
            )
          end
        end
      end

      3.times { Timeout.timeout(5) { started.pop } }
      pids = 3.times.map { Timeout.timeout(5) { backend_pids.pop } }
      wait_until_all_recorders_are_lock_blocked(pids)
    end

    threads.each { |thread| assert thread.join(5), "submission thread did not finish" }

    @attempt.reload
    assert_equal 3, @attempt.attempts
    assert @attempt.released?
    assert_equal false, @attempt.correct
    assert @attempt.satisfied?
  ensure
    threads.each { |thread| thread.kill if thread&.alive? }
  end

  private

  def wait_until_all_recorders_are_lock_blocked(backend_pids)
    blocked_count = 0
    Timeout.timeout(5) do
      ActiveRecord::Base.uncached do
        loop do
          blocked_count = ActiveRecord::Base.connection.select_value(<<~SQL.squish).to_i
            SELECT COUNT(*)
            FROM pg_stat_activity
            WHERE pid IN (#{backend_pids.join(',')})
              AND cardinality(pg_blocking_pids(pid)) > 0
          SQL
          break if blocked_count == backend_pids.size

          sleep 0.01
        end
      end
    end
  rescue Timeout::Error
    diagnostics = ActiveRecord::Base.connection.select_rows(<<~SQL.squish)
      SELECT pid, state, wait_event_type, wait_event, pg_blocking_pids(pid)
      FROM pg_stat_activity
      WHERE pid IN (#{backend_pids.join(',')})
    SQL
    flunk "only #{blocked_count} of #{backend_pids.size} recorders were database-lock blocked: " \
          "pids=#{backend_pids.inspect} activity=#{diagnostics.inspect}"
  end
end
