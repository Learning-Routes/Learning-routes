require "test_helper"

# THE CLASS: a controller must not declare a `respond_to` format it has no way to
# render.
#
# `Assessments::AssessmentsController#start` declared `format.turbo_stream` and
# `start.turbo_stream.erb` never existed. Both call sites are a `button_to`,
# which Turbo sends with `Accept: text/vnd.turbo-stream.html, text/html, …`, so
# `respond_to` negotiated turbo_stream — first in that list — found no template,
# and raised `ActionController::MissingExactTemplate`. That subclasses
# `ActionController::UnknownFormat`, which Rails maps to 406 Not Acceptable. The
# owner pressed "Iniciar examen" and nothing happened, forever.
#
# It is the exact sibling of the WP-22 defect where a turbo_stream targeted an id
# that existed nowhere: both are promises the application makes to the browser
# and cannot keep, and both fail silently at the student rather than loudly at
# us.
#
# A format is considered renderable if a template exists for it, OR the block
# renders/redirects/heads inline — `format.json { render json: ... }` needs no
# template and is not a defect.
class RespondToFormatsHaveTemplatesTest < ActiveSupport::TestCase
  CONTROLLER_GLOB = "{app,engines/*/app}/controllers/**/*_controller.rb".freeze
  VIEW_ROOTS = %w[app/views engines/*/app/views].freeze

  # `format.x` with a block that does its own rendering. Anything on the same
  # line after `format.x` counts as inline handling.
  INLINE = /format\.\w+\s*\{|format\.\w+\s+do\b/

  # `format.x if …` / `unless …` is not an unconditional promise, and this sweep
  # exists to catch unconditional promises the app cannot keep.
  #
  # `LessonsController#agent_interact` declares
  # `format.turbo_stream if turbo_stream_template?` because it is shared by five
  # actions, four of which have a template and one of which does not. That guard
  # IS the invariant this file asserts, enforced at runtime instead of by
  # inspection, so flagging it would be the sweep arguing with its own rule.
  GUARDED = /format\.\w+\s+(?:if|unless)\s/

  test "every declared respond_to format can actually be rendered" do
    unrenderable = []

    Dir[Rails.root.join(CONTROLLER_GLOB)].sort.each do |path|
      source = File.read(path)
      controller = Pathname.new(path).relative_path_from(Rails.root).to_s

      each_respond_to_block(source) do |method, formats|
        # A PRIVATE helper renders the template of whatever ACTION called it —
        # Rails looks up by `action_name`, not by the method it happens to be
        # executing. `LessonsController#agent_interact` is exactly this: four
        # public actions delegate to it and each has its own turbo_stream
        # template. Judging it by its own name is what justified deleting its
        # `format.turbo_stream` in WP-25, and that deletion is the WP-35 §2 bug.
        targets = callers_of(source, method)

        targets.each do |action|
          formats.each do |format, inline|
            next if inline
            next if template_for?(path, action, format)

            label = action == method ? "#{controller}##{action}" : "#{controller}##{action} (via #{method})"
            unrenderable << "#{label} declares format.#{format} " \
                            "with no template and no inline render"
          end
        end
      end
    end

    assert_empty unrenderable,
      "these declare a format they cannot render. Rails raises " \
      "MissingExactTemplate, a subclass of UnknownFormat, which is answered as " \
      "406 Not Acceptable — the request looks refused rather than broken:\n  " +
      unrenderable.join("\n  ")
  end

  # THE REGRESSION THIS SWEEP CAUSED ONCE, pinned by name.
  #
  # `LessonsController#agent_interact` is private and shared by five actions:
  # explain_differently, give_example, simplify and deepen each have a
  # turbo_stream template; `interact` has none. It therefore declares
  # `format.turbo_stream if turbo_stream_template?`.
  #
  # Two ways this sweep can get that wrong, and both have happened:
  #
  #   1. Judging the helper by its own name. There is no
  #      `agent_interact.turbo_stream.erb`, so the sweep flagged it, and
  #      a115721 (WP-25) deleted the `format.turbo_stream` line to satisfy it.
  #      That deletion IS the WP-35 §2 defect: the four buttons ask for a
  #      turbo stream, got UnknownFormat after a successful paid call, and the
  #      student read escaped markup.
  #   2. Reading the guarded line as an unconditional promise, which flags
  #      `interact` — the one action that genuinely has no template — and invites
  #      the same deletion a second time.
  #
  # If this test ever fails, the answer is NOT to delete the line.
  test "a guarded format in a shared private helper is not reported for any of its callers" do
    path = Rails.root.join("engines/content_engine/app/controllers/content_engine/lessons_controller.rb")
    source = File.read(path)

    assert_match(/format\.turbo_stream if turbo_stream_template\?/, source,
      "agent_interact must keep its guarded turbo_stream declaration — deleting it is WP-35 §2")

    reported = []
    each_respond_to_block(source) do |method, formats|
      callers_of(source, method).each do |action|
        formats.each do |format, inline|
          next if inline
          next if template_for?(path, action, format)

          reported << "#{action} (via #{method}) format.#{format}"
        end
      end
    end

    assert_equal [], reported,
      "the sweep reported a guarded declaration. `interact` has no turbo_stream " \
      "template BY DESIGN and the runtime guard is what keeps it from being " \
      "offered one; flagging it is how this line got deleted in WP-25."
  end

  # The four siblings must keep their templates, or the guard silently stops
  # offering the format and §2 returns without a single test going red.
  test "each legacy AI action still has the turbo_stream template the guard looks for" do
    prefix = "engines/content_engine/app/views/content_engine/lessons"

    %w[explain_differently give_example simplify deepen].each do |action|
      assert File.exist?(Rails.root.join(prefix, "#{action}.turbo_stream.erb")),
        "#{action}.turbo_stream.erb is gone: `turbo_stream_template?` will answer false " \
        "and the button will silently stop receiving a stream"
    end
  end

  # A sweep that matches nothing passes vacuously, which is worse than no sweep.
  test "the sweep is looking at the controllers it thinks it is" do
    controllers = Dir[Rails.root.join(CONTROLLER_GLOB)]
    assert_operator controllers.size, :>=, 40,
      "the controller glob stopped matching; the assertion above would pass on an empty set"

    with_respond_to = controllers.count { |path| File.read(path).include?("respond_to do") }
    assert_operator with_respond_to, :>=, 5,
      "no respond_to blocks found; the parser below has stopped recognising them"
  end

  private

  # Yields [action_name, [[format, inline?], ...]] for each respond_to block,
  # attributing it to the nearest preceding `def`.
  def each_respond_to_block(source)
    current_action = nil
    in_block = false
    formats = []

    source.each_line do |line|
      if (match = line.match(/^\s*def\s+([a-z_][\w]*[?!]?)/))
        current_action = match[1]
      end

      if line.match?(/respond_to\s+do\s*\|/)
        in_block = true
        formats = []
        next
      end

      next unless in_block

      if (match = line.match(/^\s*format\.(\w+)/))
        formats << [match[1], line.match?(INLINE) || line.match?(GUARDED)]
      elsif line.match?(/^\s*end\s*$/)
        in_block = false
        yield(current_action, formats) if current_action && formats.any?
      end
    end
  end

  # The action names a `respond_to` in `method` can be reached under.
  #
  # A public method answers for itself. A private one answers for every public
  # action that calls it, because that is the name Rails renders by.
  def callers_of(source, method)
    return [method] unless private_methods_in(source).include?(method)

    callers = public_actions_in(source).select do |action|
      body = method_body(source, action)
      body&.match?(/(^|[^\w.])#{Regexp.escape(method)}\b/)
    end
    callers.presence || [method]
  end

  def private_methods_in(source)
    boundary = source.lines.index { |l| l.match?(/^\s*private\s*$/) }
    return [] if boundary.nil?

    source.lines[boundary..].join.scan(/^\s*def\s+([a-z_][\w]*[?!]?)/).flatten
  end

  def public_actions_in(source)
    boundary = source.lines.index { |l| l.match?(/^\s*private\s*$/) } || source.lines.size
    source.lines[0...boundary].join.scan(/^\s*def\s+([a-z_][\w]*[?!]?)/).flatten
  end

  def method_body(source, name)
    lines = source.lines
    start = lines.index { |l| l =~ /^(\s*)def #{Regexp.escape(name)}\b/ }
    return nil if start.nil?

    indent = lines[start][/^\s*/].length
    finish = ((start + 1)...lines.size).find do |i|
      lines[i] =~ /^\s*end\b/ && lines[i][/^\s*/].length == indent
    end
    finish ? lines[(start + 1)...finish].join : nil
  end

  def template_for?(controller_path, action, format)
    prefix = controller_prefix(controller_path)

    VIEW_ROOTS.any? do |root|
      Dir[Rails.root.join(root, prefix, "#{action}.#{format}.*")].any? ||
        Dir[Rails.root.join(root, prefix, "#{action}.*")].any? do |candidate|
          # `show.html.erb` satisfies format.html; a format-less `show.erb` would
          # satisfy anything.
          File.basename(candidate).split(".")[1] == format
        end
    end
  end

  # app/controllers/admin/users_controller.rb          -> admin/users
  # engines/assessments/app/controllers/assessments/assessments_controller.rb
  #                                                    -> assessments/assessments
  def controller_prefix(path)
    relative = Pathname.new(path).relative_path_from(Rails.root).to_s
    relative
      .sub(%r{\Aengines/[^/]+/app/controllers/}, "")
      .sub(%r{\Aapp/controllers/}, "")
      .sub(/_controller\.rb\z/, "")
  end
end
