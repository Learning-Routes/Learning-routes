require "test_helper"
require "prism"

# STEP 37 §2. A rescue that answers an error with a bare constant (nil, false,
# {}, 0) or with nothing at all leaves no trace: the feature quietly does less
# and nobody can tell why. Such a rescue must log one line (class, message,
# identifying id), re-raise, or report. A rescue whose body does real work with
# the failure (retry, read the winning row, mark the record failed, hand the
# message back) is handling it, not swallowing it, and is not checked here.
class NoSilentRescueTest < ActiveSupport::TestCase
  # Where answering with a constant is the whole point, and why. Keyed by file
  # and the exceptions rescued, so a moved line does not break the entry.
  EXEMPT = {
    "engines/community_engine/app/controllers/community_engine/follows_controller.rb [ActiveRecord::RecordNotUnique]" =>
      "a duplicate follow is a no-op; the unique index already holds the row",
    "engines/content_engine/app/services/content_engine/audio_storage.rb [KeyError, ArgumentError, Errno::ENOENT, Errno::EACCES, Errno::ELOOP]" =>
      "path validation: an unusable stored path is refused with nil, which the caller treats as no audio",
    "engines/content_engine/app/services/content_engine/audio_storage.rb [Errno::ENOENT, Errno::EACCES]" =>
      "deleting a file that is already gone or not ours reports false to the caller",
    "engines/content_engine/app/services/content_engine/voice_evaluator.rb [ArgumentError, Errno::ENOENT]" =>
      "no ffprobe or an unreadable duration means the duration is unknown, which the caller handles as nil",
    "engines/learning_routes_engine/app/controllers/learning_routes_engine/steps_controller.rb [ArgumentError, TypeError]" =>
      "an unparsable stored timestamp means no failure time; the retry check treats it as absent"
  }.freeze

  CONSTANTS = [Prism::NilNode, Prism::TrueNode, Prism::FalseNode, Prism::IntegerNode,
               Prism::FloatNode, Prism::StringNode, Prism::SymbolNode].freeze

  class Finder < Prism::Visitor
    attr_reader :found

    def initialize
      @found = []
      super
    end

    def visit_rescue_node(node)
      @found << node if swallows?(node.statements)
      super
    end

    def visit_rescue_modifier_node(node)
      @found << node if constant?(node.rescue_expression)
      super
    end

    private

    def swallows?(statements)
      statements.nil? || statements.body.all? { |stmt| constant?(stmt) }
    end

    def constant?(node)
      CONSTANTS.any? { |klass| node.is_a?(klass) } ||
        ((node.is_a?(Prism::HashNode) || node.is_a?(Prism::ArrayNode)) && node.elements.empty?)
    end
  end

  test "no rescue in app code swallows the error silently" do
    offenders = Rails.root.glob("{app,engines/*/app}/**/*.rb").flat_map do |path|
      file = path.relative_path_from(Rails.root).to_s
      finder = Finder.new
      Prism.parse_file(path.to_s).value.accept(finder)
      finder.found.filter_map do |node|
        rescued = node.respond_to?(:exceptions) ? node.exceptions.map(&:slice).join(", ") : "modifier"
        next if EXEMPT.key?("#{file} [#{rescued}]")

        "#{file}:#{node.location.start_line} [#{rescued}]"
      end
    end

    assert_empty offenders,
      "#{offenders.size} rescue(s) swallow the error; log class, message and id, or re-raise:\n#{offenders.join("\n")}"
  end
end
