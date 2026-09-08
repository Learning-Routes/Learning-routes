require "test_helper"

# THE CLASS: a broadcast nobody is listening to.
#
# WP-35 §1. `TutorReplyJob` broadcast the tutor's answer to
# `tutor_chat_step_#{step.id}` and no view had ever called `turbo_stream_from`
# with that name. The production log for 7 September settles what was and was not
# broken: the job performed in 1606 ms with no error and SolidCable::TrimJob ran
# in the same process, so the cable database exists and broadcasts work. The
# reply was written to `tutor_messages` and delivered to nobody.
#
# What the panel had instead was `new EventSource("/turbo-stream?stream=…")`,
# which is not a route — a 404 every few seconds per open lesson, delivering
# nothing.
#
# A broadcast is half a contract. This sweep holds the other half: for every
# stream name a `Turbo::StreamsChannel.broadcast_*` call writes to, some view
# must subscribe to a stream built the same way. It is grep-shaped on purpose —
# the pairing is between a Ruby string in a job and an ERB string in a view, and
# nothing else in the app can see both.
module LearningRoutesEngine
  class BroadcastHasASubscriberTest < ActiveSupport::TestCase
    ROOTS = %w[app engines lib].freeze

    # A stream name is written as "prefix_#{expression}" on both sides. The
    # PREFIX is what has to match; the expression is a route id here and a step
    # id there.
    STREAM_LITERAL = /"([a-z][a-z0-9_]*?)_\#\{/

    # Broadcasts with no subscriber that are NOT the bug this package fixes, each
    # with the reason it is allowed to stand. Anything else fails the sweep.
    #
    # `ai_interaction_` is an unfinished feature, not a delivery defect:
    # `AiRequestJob` broadcasts `ai_orchestrator/interactions/_result` and
    # `_error`, and NO page renders either partial or subscribes to the stream,
    # so there is no student-visible symptom to fix and nothing to attach a
    # subscriber to. Inventing one would be worse than recording it. It belongs
    # on the roadmap; see WP35_HANDOFF.md.
    KNOWN_UNSUBSCRIBED = {
      "ai_interaction" => "AiRequestJob broadcasts result/error partials no page renders"
    }.freeze

    test "every broadcast stream prefix has a view that subscribes to it" do
      broadcast = stream_prefixes_from(ruby_files, /Turbo::StreamsChannel\.broadcast_\w+_to\(\s*\n?\s*"([a-z][a-z0-9_]*?)_\#\{/)
      subscribed = stream_prefixes_from(erb_files, /turbo_stream_from\s+"([a-z][a-z0-9_]*?)_\#\{/)

      orphans = broadcast - subscribed - KNOWN_UNSUBSCRIBED.keys

      assert_equal [], orphans.sort,
        "these streams are broadcast to and nothing subscribes: the server does its " \
        "job and the page never hears about it. Add `turbo_stream_from` in the view " \
        "that should receive them, or record why not in KNOWN_UNSUBSCRIBED."
    end

    test "the known-unsubscribed list stays honest" do
      subscribed = stream_prefixes_from(erb_files, /turbo_stream_from\s+"([a-z][a-z0-9_]*?)_\#\{/)

      KNOWN_UNSUBSCRIBED.each_key do |prefix|
        assert_not_includes subscribed, prefix,
          "#{prefix} now HAS a subscriber — remove it from KNOWN_UNSUBSCRIBED so the " \
          "sweep guards it like the rest"
      end
    end

    test "the tutor chat stream is subscribed, not merely broadcast to" do
      panel = File.read(Rails.root.join(
        "engines/learning_routes_engine/app/views/learning_routes_engine/tutor_chats/_chat_panel.html.erb"
      ))

      assert_match(/turbo_stream_from\s+"tutor_chat_step_\#\{step\.id\}"/, panel,
        "the panel must subscribe to the stream TutorReplyJob broadcasts to, and it " \
        "must be INSIDE the panel so the subscription lives and dies with it")
    end

    test "no view opens a hand-rolled EventSource against a turbo stream" do
      offenders = js_files.select do |f|
        File.readlines(f).any? { |line| line.match?(/new EventSource\(/) && !line.strip.start_with?("//") }
      end

      assert_equal [], offenders.map { |f| f.to_s.sub("#{Rails.root}/", "") },
        "`/turbo-stream` is not a route in this app: an EventSource against it is a " \
        "404 every few seconds and delivers nothing. Subscribe with turbo_stream_from."
    end

    private

    def stream_prefixes_from(files, pattern)
      files.flat_map { |f| File.read(f).scan(pattern).flatten }.uniq
    end

    def ruby_files = glob("**/*.rb")
    def erb_files  = glob("**/*.erb")
    def js_files   = glob("**/*.js")

    def glob(pattern)
      ROOTS.flat_map { |root| Dir[Rails.root.join(root, pattern)] }
           .reject { |f| f.include?("/node_modules/") || f.include?("/test/") }
    end
  end
end
