require "test_helper"

# THE CLASS, and the exact inverse of RespondToFormatsHaveTemplatesTest.
#
# That sweep asks: does every format a controller DECLARES have a way to render?
# This one asks the other half: does every format the CLIENT ASKS FOR get
# declared? A `respond_to` that omits the format the browser requested raises
# `ActionController::UnknownFormat` — and Rails answers that with 406, which
# looks like a refusal rather than a bug.
#
# WP-35 §2, from the production log of 7 September. The four legacy AI buttons
# fetch with `Accept: text/vnd.turbo-stream.html`. `agent_interact`'s SUCCESS
# `respond_to` declared only json and html. So the paid call ran, succeeded, and
# THEN `respond_to` raised UnknownFormat — which the `rescue => e` below it
# caught as if the model had failed, logged as "Agent interaction failed", and
# answered from its own turbo_stream branch with an escaped `<p …>` at HTTP 200.
# The student read the markup of an error message about a call that had worked.
#
# The `format.turbo_stream` line was removed by a115721 (WP-25) reasoning that
# `agent_interact.turbo_stream.erb` does not exist. True — but Rails renders the
# template named after the calling ACTION, and
# explain_differently/give_example/simplify/deepen.turbo_stream.erb all exist and
# are correct. The reasoning held only for `interact`, which has no template.
#
# Pairing is view-shaped because that is where the URL is written: a JS
# controller reads its URL from a `data-url` or `data-<identifier>-…-url-value`
# attribute, and the ERB that mounts the controller is the only place both the
# Stimulus identifier and the Rails path helper appear together.
class FetchedFormatsAreDeclaredTest < ActiveSupport::TestCase
  MIME_BY_FORMAT = { "turbo_stream" => "text/vnd.turbo-stream.html", "json" => "application/json" }.freeze

  # Actions whose missing format is deliberate, with the reason. Empty, and that
  # is the point.
  #
  # `interact` was going to live here: it is the unified JSON endpoint and has no
  # `interact.turbo_stream.erb`, so declaring the format unconditionally would
  # recreate the 406 WP-25 removed. The fix made the exception unnecessary
  # instead — `agent_interact` declares `format.turbo_stream if
  # turbo_stream_template?`, so the format is offered exactly when it can be
  # rendered, and no action needs excusing.
  ALLOWED_MISSING = {}.freeze

  test "every format the client asks for is declared by the action it asks" do
    missing = []

    stimulus_accepts = accepts_by_stimulus_identifier

    view_files.each do |view|
      source = File.read(view)
      identifiers = source.scan(/data-controller="([^"]+)"/).flatten.flat_map(&:split).uniq
      next if identifiers.none? { |id| stimulus_accepts.key?(id) }

      helpers_in(source).each do |attribute, helper|
        target = route_map[helper]
        next if target.nil?

        owners = owning_identifiers(attribute, identifiers)
        formats = owners.flat_map { |id| stimulus_accepts[id] || [] }.uniq

        formats.each do |format|
          next if Array(ALLOWED_MISSING[target]).include?(format)
          next if declares_format?(target, format)

          missing << "#{target} is fetched with Accept: #{MIME_BY_FORMAT[format]} " \
                     "(#{File.basename(view)} -> #{helper}) but declares no format.#{format}"
        end
      end
    end

    assert_equal [], missing.uniq.sort,
      "the client asks for a format the action does not declare. Rails raises " \
      "UnknownFormat, answered as 406 — and if a rescue catches it, the student " \
      "reads an error about a call that actually worked:\n  " + missing.uniq.sort.join("\n  ")
  end

  # A sweep that matches nothing passes vacuously.
  test "the sweep actually pairs views with fetched formats" do
    paired = view_files.count do |view|
      source = File.read(view)
      ids = source.scan(/data-controller="([^"]+)"/).flatten.flat_map(&:split).uniq
      ids.any? { |id| accepts_by_stimulus_identifier[id].present? } && helpers_in(source).any?
    end

    assert_operator paired, :>=, 5, "the pairing found almost nothing; the sweep is not looking where it thinks"
  end

  test "the allowed-missing list stays honest" do
    ALLOWED_MISSING.each do |target, formats|
      formats.each do |format|
        assert_not declares_format?(target, format),
          "#{target} now declares format.#{format} — remove it from ALLOWED_MISSING"
      end
    end
  end

  private

  # Stimulus identifier ("ai-interaction") -> the formats its fetches request.
  def accepts_by_stimulus_identifier
    @accepts_by_stimulus_identifier ||= Dir[Rails.root.join("app/javascript/controllers/*_controller.js")]
      .each_with_object({}) do |path, acc|
        identifier = File.basename(path, "_controller.js").tr("_", "-")
        source = File.read(path)
        formats = MIME_BY_FORMAT.select { |_f, mime| source.include?(%("Accept": "#{mime})) }.keys
        acc[identifier] = formats if formats.any?
      end
  end

  # [attribute, helper] pairs, so each URL can be attributed to the Stimulus
  # controller that reads it.
  def helpers_in(source)
    source.scan(/data-(url|[a-z0-9-]+-url-value)="<%=\s*(?:[a-z_]+\.)?([a-z_]+_path)\(/).uniq
  end

  # Which mounted controller reads this attribute.
  #
  # `data-url` is generic, so it belongs to whichever controllers the file
  # mounts. `data-<identifier>-<name>-url-value` is Stimulus's own convention and
  # names its owner — without honouring that, a file like `_lesson.html.erb`,
  # which mounts a dozen controllers, pairs every URL in it with every Accept
  # header any of them sends. That reported `block_attempts#create` as missing
  # turbo_stream when the only thing that fetches `data-block-url-value` is
  # `block_submission.js`, which asks for JSON.
  def owning_identifiers(attribute, mounted)
    return mounted if attribute == "url"

    rest = attribute.sub(/-url-value\z/, "")
    owner = mounted.select { |id| rest == id || rest.start_with?("#{id}-") }
                   .max_by(&:length)
    owner ? [owner] : []
  end

  def route_map
    @route_map ||= begin
      sets = [Rails.application.routes] +
             Rails::Engine.subclasses.filter_map { |e| e.instance.routes rescue nil }
      sets.uniq.each_with_object({}) do |set, acc|
        set.routes.each do |route|
          next if route.name.blank? || route.defaults[:controller].blank?

          acc["#{route.name}_path"] ||= "#{route.defaults[:controller]}##{route.defaults[:action]}"
        end
      end
    end
  end

  # Does the action's `respond_to` mention this format?
  #
  # An action with NO `respond_to` at all is not a defect: it renders one thing
  # for every Accept (`render json:` on its own line serves a turbo-stream
  # request perfectly well). Only an action that negotiates and OMITS the
  # requested format raises UnknownFormat, so only that is flagged.
  def declares_format?(target, format)
    controller, action = target.split("#")
    path = controller_path_for(controller)
    return true if path.nil? # not ours to judge

    body = action_body(File.read(path), action)
    return true if body.nil?

    blocks = respond_to_blocks(body)
    return true if blocks.empty?

    # EVERY block, not any. An action can reach several `respond_to`s — a success
    # one and one per rescue — and a request for this format is answered by
    # whichever it reaches. `agent_interact` is exactly this shape: its two
    # rescue branches declared turbo_stream and its SUCCESS branch did not, so
    # asking "does the action mention format.turbo_stream anywhere" says yes
    # about the very defect this sweep exists to find.
    blocks.all? { |block| block.match?(/format\.#{format}\b/) }
  end

  # Each `respond_to do |format| … end`, sliced by indentation for the same
  # reason method bodies are.
  def respond_to_blocks(body)
    lines = body.lines
    lines.each_index.filter_map do |i|
      next unless lines[i] =~ /^(\s*)respond_to do\b/

      indent = lines[i][/^\s*/].length
      finish = ((i + 1)...lines.size).find do |j|
        lines[j] =~ /^\s*end\b/ && lines[j][/^\s*/].length == indent
      end
      finish ? strip_comments(lines[(i + 1)...finish].join) : nil
    end
  end

  # A comment saying `format.turbo_stream` is not a declaration. The very block
  # this sweep exists to catch carries the comment
  # "No `format.turbo_stream`: agent_interact.turbo_stream.erb does not exist",
  # so matching comment text made the defect look like the fix.
  def strip_comments(source)
    source.lines.reject { |line| line.strip.start_with?("#") }.join
  end

  def controller_path_for(controller)
    Dir[Rails.root.join("{app,engines/*/app}/controllers/#{controller}_controller.rb")].first
  end

  # The action's own body PLUS any private method it delegates to — the four
  # legacy actions are one-liners calling `agent_interact`, and the `respond_to`
  # that matters lives there.
  #
  # Bodies are found by INDENTATION, not by the first `end`: a `respond_to do`
  # inside the method has its own `end`, and a non-greedy match to `^\s*end`
  # stops there and reports a method that negotiates as one that does not.
  def action_body(source, action, seen = [])
    return nil if seen.include?(action)

    body = method_source(source, action)
    return nil if body.nil?

    seen << action
    body.scan(/^\s*(\w+)[\s(]/).flatten.uniq.each do |name|
      inner = action_body(source, name, seen)
      body += inner if inner
    end
    body
  end

  def method_source(source, name)
    lines = source.lines
    start = lines.index { |l| l =~ /^(\s*)def #{Regexp.escape(name)}\b/ }
    return nil if start.nil?

    indent = lines[start][/^\s*/].length
    finish = ((start + 1)...lines.size).find do |i|
      lines[i] =~ /^\s*end\b/ && lines[i][/^\s*/].length == indent
    end
    return nil if finish.nil?

    lines[(start + 1)...finish].join
  end

  def view_files
    @view_files ||= Dir[Rails.root.join("{app,engines/*/app}/views/**/*.erb")]
  end
end
