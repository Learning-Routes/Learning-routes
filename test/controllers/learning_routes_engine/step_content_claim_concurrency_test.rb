require "test_helper"

module LearningRoutesEngine
  # THE CLASS: no request path may enqueue ContentPipelineJob without winning an
  # atomic claim first.
  #
  # Asserted by driving two genuinely concurrent callers, not by reading the
  # source. The defect this pins was invisible to every single-threaded test:
  # `request_content_generation!` decided whether to enqueue by reading
  # `metadata["content_generating"]`, a flag only written when the job STARTS.
  # The content frame polls every 3s, so with a full queue at route-creation time
  # every poll inside the enqueue-to-start window read `false` and enqueued
  # another pipeline for the same step. ContentPipelineJob guards only on
  # `content_ready`, so every duplicate ran and every duplicate billed ~2.33¢.
  #
  # Transactional tests cannot show this: two threads sharing one uncommitted
  # transaction never race. This class turns them off and takes real connections,
  # the same pattern as the other concurrency tests in this codebase.
  class StepContentClaimConcurrencyTest < ActiveSupport::TestCase
    include ActiveJob::TestHelper

    self.use_transactional_tests = false

    EMAIL_PATTERN = "step-claim-concurrency-%"

    setup do
      delete_concurrency_records
      @user = Core::User.create!(
        name: "Racer", email: "step-claim-concurrency-#{SecureRandom.hex(4)}@example.test",
        password: "password123", password_confirmation: "password123",
        email_verified_at: Time.current
      )
      profile = LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoute.create!(learning_profile: profile, topic: "Claim race", locale: "en")
      @preview = RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
      @step = RouteStep.create!(
        learning_route: @route, route_module: @preview, position: 1,
        title: "Ungenerated lesson", content_type: :lesson, status: :available
      )
    end

    teardown do
      delete_concurrency_records
    end

    test "two simultaneous requests for the same ungenerated step enqueue exactly one pipeline" do
      results = run_two_concurrent_requests

      assert_equal 1, results[:enqueued],
        "the 3s poll re-enqueued the same lesson; only one claim may win"
      assert_equal 1, results[:enqueued_step_ids].uniq.size
      assert_equal @step.id, results[:enqueued_step_ids].first
    end

    test "the losing request still reports the step as generating rather than failed" do
      run_two_concurrent_requests

      # The student who lost the race must see the spinner, not an error and not
      # a second spend.
      assert @step.reload.metadata["content_generating"],
        "the winning claim must leave the step marked in flight"
    end

    # A claim nobody consumes is worse than no claim: the step looks permanently
    # in flight and nothing ever regenerates it.
    test "a failed enqueue releases the claim instead of stranding the step" do
      controller = controller_for(RouteStep.find(@step.id))
      original = ContentPipelineJob.method(:perform_later)
      ContentPipelineJob.define_singleton_method(:perform_later) { |*| raise "queue down" }

      begin
        controller.send(:request_content_generation!)
      ensure
        ContentPipelineJob.define_singleton_method(:perform_later, original)
      end

      assert_nil @step.reload.metadata["content_generating"],
        "an enqueue that never happened must not leave the step claimed forever"
    end

    test "a step the pipeline declines to run gives its claim back" do
      locked = @route.route_modules.create!(position: 2, title: "Paid", access_state: :locked)
      paid_step = RouteStep.create!(
        learning_route: @route, route_module: locked, position: 2,
        title: "Paid lesson", content_type: :lesson, status: :locked
      )
      assert_equal [paid_step.id],
        ContentPrefetcher.claim([paid_step.id], access_states: RouteModule.access_states.keys)

      ContentPipelineJob.perform_now(paid_step.id)

      assert_nil paid_step.reload.metadata["content_generating"],
        "ContentPipelineJob refuses non-preview steps; it must release the claim it did not use"
    end

    private

    # Both threads load the step BEFORE the barrier, so both hold a copy showing
    # `content_generating` absent — exactly the state two polls 3s apart see
    # while the job sits in the queue.
    def run_two_concurrent_requests
      ready = Queue.new
      release = Queue.new
      enqueued = Queue.new

      threads = 2.times.map do
        Thread.new do
          ActiveRecord::Base.connection_pool.with_connection do
            controller = controller_for(RouteStep.find(@step.id))
            ready << true
            release.pop
            perform_enqueued_jobs(only: ->(_) { false }) do
              controller.send(:request_content_generation!)
            end
          end
        rescue StandardError => e
          enqueued << { error: e }
        end
      end

      2.times { ready.pop }
      2.times { release << true }
      threads.each(&:join)

      jobs = enqueued_jobs.select { |job| job["job_class"] == ContentPipelineJob.name || job[:job] == ContentPipelineJob }
      { enqueued: jobs.size, enqueued_step_ids: jobs.map { |job| (job["arguments"] || job[:args]).first } }
    end

    def controller_for(step)
      StepsController.new.tap { |controller| controller.instance_variable_set(:@step, step) }
    end

    def delete_concurrency_records
      users = Core::User.where("email LIKE ?", EMAIL_PATTERN)
      profiles = LearningProfile.where(user_id: users.select(:id))
      routes = LearningRoute.where(learning_profile_id: profiles.select(:id))

      # `learning_routes_engine_preserve_preview` refuses a direct delete of the
      # preview module. Deleting the ROUTE cascades to its modules, which the
      # trigger allows, so the route must go first and the modules never directly.
      RouteStep.where(learning_route_id: routes.select(:id)).delete_all
      routes.delete_all
      profiles.delete_all
      users.delete_all
    end
  end
end
