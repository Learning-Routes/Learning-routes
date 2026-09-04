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

  test "every declared respond_to format can actually be rendered" do
    unrenderable = []

    Dir[Rails.root.join(CONTROLLER_GLOB)].sort.each do |path|
      source = File.read(path)
      controller = Pathname.new(path).relative_path_from(Rails.root).to_s

      each_respond_to_block(source) do |action, formats|
        formats.each do |format, inline|
          next if inline
          next if template_for?(path, action, format)

          unrenderable << "#{controller}##{action} declares format.#{format} " \
                          "with no template and no inline render"
        end
      end
    end

    assert_empty unrenderable,
      "these declare a format they cannot render. Rails raises " \
      "MissingExactTemplate, a subclass of UnknownFormat, which is answered as " \
      "406 Not Acceptable — the request looks refused rather than broken:\n  " +
      unrenderable.join("\n  ")
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
        formats << [match[1], line.match?(INLINE)]
      elsif line.match?(/^\s*end\s*$/)
        in_block = false
        yield(current_action, formats) if current_action && formats.any?
      end
    end
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
