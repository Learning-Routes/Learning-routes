require "test_helper"
require "turbo/broadcastable/test_helper"

# WP-35 §1. The job's contract is not "produce a reply" — it is "always end in a
# message on the page".
#
# The production log for 7 September shows the happy path already works: the job
# performed in 1606 ms with no error and the cable database is live. What was
# missing was a subscriber (see BroadcastHasASubscriberTest) and, when the paid
# call raises, anything at all: the `rescue` logged `e.message` and returned, no
# reply row was written, nothing was broadcast, and the student was left with a
# skeleton pulsing forever. `SpendGuard::LimitExceeded` is the likeliest way in.
#
# The same log carries two [StrictLoading] warnings for `TutorMessage#step` and
# `TutorMessage#user` at lines 8-11 — logged rather than raised because
# production sets `action_on_strict_loading_violation` to `:log`, which is the
# same reason WP-32 found a lazily-loaded step quiz nobody had noticed.
module LearningRoutesEngine
  class TutorReplyJobTest < ActiveSupport::TestCase
    include ActiveJob::TestHelper
    include Turbo::Broadcastable::TestHelper

    def setup
      @user = create_test_user(email_verified_at: Time.current, locale: "es")
      profile = LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoute.create!(
        learning_profile: profile, topic: "Portugués", locale: "es", status: :active
      )
      preview = RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
      @step = @route.route_steps.create!(
        route_module: preview, title: "Saludos", position: 0, status: :in_progress,
        content_type: :lesson, level: :nv1, bloom_level: 1
      )
      @question = TutorMessage.create!(
        user: @user, step: @step, role: "user", content: "¿Cómo se dice hola?"
      )
    end

    test "a reply is appended to the stream the panel subscribes to" do
      with_reply("Se dice *olá*.") do
        assert_turbo_stream_broadcasts("tutor_chat_step_#{@step.id}", count: 1) do
          TutorReplyJob.perform_now(@question.id)
        end
      end

      reply = TutorMessage.where(user: @user, step: @step, role: "assistant").last
      assert_equal "Se dice *olá*.", reply.content
    end

    # The half that did not exist. A paid call that raises must still leave the
    # student with something to read.
    test "a failed reply still writes an assistant message and broadcasts it" do
      with_failure(AiOrchestrator::SpendGuard::LimitExceeded.new("daily ceiling", kind: :daily_budget)) do
        assert_difference -> { TutorMessage.where(step: @step, role: "assistant").count }, 1 do
          assert_turbo_stream_broadcasts("tutor_chat_step_#{@step.id}", count: 1) do
            TutorReplyJob.perform_now(@question.id)
          end
        end
      end

      reply = TutorMessage.where(user: @user, step: @step, role: "assistant").last
      assert_equal I18n.t("tutor.unavailable", locale: :es), reply.content,
        "the student must be told, in the route's language, that no answer is coming"
    end

    test "a failure the job cannot classify still ends in a message" do
      with_failure(RuntimeError.new("upstream exploded")) do
        assert_difference -> { TutorMessage.where(step: @step, role: "assistant").count }, 1 do
          TutorReplyJob.perform_now(@question.id)
        end
      end
    end

    # Production logs the violation and carries on, so this is an N+1 on a paid
    # path rather than a crash — invisible unless something asserts it.
    test "the message is loaded with its step and user, not lazily" do
      with_reply("ok") do
        in_deployed_strict_loading_mode do
          assert_nothing_raised { TutorReplyJob.perform_now(@question.id) }
        end
      end
    end

    private

    # A completed interaction, without reaching a model. `Struct` cannot carry a
    # `completed?` member, so this is a small stand-in class.
    Interaction = Class.new do
      attr_reader :response, :id

      def initialize(response) = (@response = response; @id = SecureRandom.uuid)
      def completed? = true
    end

    # `minitest/mock` is unavailable in this suite (see checkouts_test.rb); the
    # house idiom is to swap the singleton and restore it.
    def with_orchestrate(replacement)
      original = AiOrchestrator::Orchestrate.method(:call)
      AiOrchestrator::Orchestrate.define_singleton_method(:call, replacement)
      yield
    ensure
      AiOrchestrator::Orchestrate.define_singleton_method(:call, original)
    end

    def with_reply(text, &outer)
      with_orchestrate(->(**) { Interaction.new(text) }, &outer)
    end

    def with_failure(error, &outer)
      with_orchestrate(->(**) { raise error }, &outer)
    end

    def in_deployed_strict_loading_mode
      previous = ActiveRecord::Base.strict_loading_mode
      ActiveRecord::Base.strict_loading_mode = :n_plus_one_only
      yield
    ensure
      ActiveRecord::Base.strict_loading_mode = previous
    end
  end
end
