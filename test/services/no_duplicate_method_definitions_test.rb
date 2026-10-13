require "test_helper"
require "ripper"

# A class that defines the same instance method twice in one file.
#
# WHY THIS EXISTS, AND WHAT IT WOULD HAVE CAUGHT
#
# WP-36 and WP-38 both added a `split_json_object` and a `safe_parse_json` to
# `ContentEngine::LessonSectionParser`, each branch carrying a merge note saying so.
# When WP-36 landed first and WP-38 merged on top, git reported
# `Auto-merging …lesson_section_parser.rb` — **no conflict** — and produced a file
# defining both methods twice. Ruby does not warn on redefinition, every suite stayed
# green, and the later definition silently won. The two `split_json_object` bodies
# were not interchangeable: one returned a stripped, `.presence` remainder and the
# other returned the raw string, so the clean merge quietly repointed WP-36's motion
# parser at a contract it was never written against.
#
# That is the class of failure this file exists to make loud: not a conflict, not a
# warning, not a red test — a merge that succeeds and changes behaviour.
#
# WHAT COUNTS AS A DUPLICATE
#
# The same method name defined twice at the same lexical scope in the same file.
# Parsed with Ripper rather than grepped, so that:
#
#   * `def self.x` and `def x` are different methods and do not collide;
#   * `class << self` is its own scope, so a singleton `x` may coexist with an
#     instance `x`;
#   * nesting is honoured — `Foo#call` and `Foo::Bar#call` are different methods;
#   * the endless form (`def x = y`) is seen, which a line-based `def` counter that
#     pairs `def` with `end` would miscount;
#   * a `def` inside a BLOCK gets its own scope. `Data.define(...) do def available? = true end`
#     builds a separate anonymous class, and `app/services/commerce/` has seven files
#     holding two of them side by side — a walker that read those as the enclosing
#     class's methods reported seven duplicates that do not exist. Measured: that was
#     this sweep's first output.
#
# Deliberately per FILE, not per class. Reopening a class in another file is a normal
# Ruby idiom (concerns, decorators, engine overrides) and a sweep that flagged it
# would be turned off within a week. One file defining the same method twice has no
# legitimate form in this codebase.
class NoDuplicateMethodDefinitionsTest < ActiveSupport::TestCase
  ROOTS = %w[app engines].freeze

  test "no class or module defines the same instance method twice in one file" do
    offenders = {}

    ruby_files.each do |path|
      duplicates = duplicate_definitions(File.read(path))
      offenders[path.relative_path_from(Rails.root).to_s] = duplicates if duplicates.any?
    end

    assert_equal({}, offenders, <<~MESSAGE)
      The same method is defined twice in one file. Ruby does not warn about this and
      the LAST definition wins, so the earlier body is dead code that still reads as
      live. This is what a clean merge of two branches that both added the same helper
      looks like.

      Delete one definition. If the two bodies differ, decide which contract the
      callers need and document it in one place — do not keep both and rely on order.

      #{offenders.map { |file, dups| "#{file}\n    #{dups.join("\n    ")}" }.join("\n  ")}
    MESSAGE
  end

  # The sweep must be able to see a duplicate at all. Without this, a bug in the
  # walker below turns the assertion above into an expensive way of asserting true.
  test "the walker detects a duplicate, and does not invent one" do
    duplicated = <<~RUBY
      module Demo
        class Thing
          def call = 1
          def other = 2
          def call = 3
        end
      end
    RUBY

    assert_equal ["Demo::Thing#call (lines 3, 5)"], duplicate_definitions(duplicated)
  end

  # The seven false positives this sweep reported on its first run, in miniature.
  # Two `Data.define` blocks in one class body, each with its own `available?`: two
  # different anonymous classes, not a redefinition.
  test "two methods of the same name in two different blocks are not a duplicate" do
    fine = <<~RUBY
      module Commerce
        class FeeConfiguration
          Available = Data.define(:a) do
            def available? = true
          end
          Unavailable = Data.define(:reason) do
            def available? = false
          end
        end
      end
    RUBY

    assert_equal [], duplicate_definitions(fine)
  end

  # But a block is still a scope, so the same name twice INSIDE one block is caught.
  test "the same method twice inside one block is still a duplicate" do
    bad = <<~RUBY
      Thing = Data.define(:a) do
        def call = 1
        def call = 2
      end
    RUBY

    assert_equal 1, duplicate_definitions(bad).size
  end

  test "the walker separates singleton methods, class << self, and nesting" do
    fine = <<~RUBY
      module Demo
        class Thing
          class << self
            def call = 1
          end

          def self.build = 2
          def call = 3

          class Inner
            def call = 4
          end
        end
      end
    RUBY

    assert_equal [], duplicate_definitions(fine)
  end

  private

  def ruby_files
    ROOTS.flat_map { |root| Rails.root.join(root).glob("**/*.rb") }.sort
  end

  # => ["Scope#method (lines 3, 5)", ...]
  def duplicate_definitions(source)
    sexp = Ripper.sexp(source)
    return [] if sexp.nil? # unparsable: not this test's business

    seen = Hash.new { |hash, key| hash[key] = [] }
    walk(sexp, [], seen, Counter.new)

    seen.filter_map do |(scope, name), lines|
      next if lines.size < 2

      "#{scope}##{name} (lines #{lines.sort.join(', ')})"
    end.sort
  end

  # A monotonic label source, so two sibling blocks never share a scope.
  class Counter
    def initialize = @n = 0
    def next_label = "{block #{@n += 1}}"
  end

  def walk(node, scope, seen, counter)
    return unless node.is_a?(Array)

    case node.first
    when :class, :module
      walk_children(node, scope + [const_name(node[1])], seen, counter)
      return
    when :sclass
      # `class << self` — a separate namespace, so an instance `call` and a
      # singleton `call` in the same class are not a collision.
      walk_children(node, scope + ["<<self"], seen, counter)
      return
    when :do_block, :brace_block
      # Each block is its own scope. `Data.define(...) do ... end` and
      # `Class.new do ... end` build a separate object per block, so two blocks in
      # one class body may both define `available?` without redefining anything.
      walk_children(node, scope + [counter.next_label], seen, counter)
      return
    when :defs
      # `def self.x` / `def obj.x`: a singleton method, namespaced apart from the
      # instance method of the same name.
      name, line = method_name_and_line(node[3])
      seen[[(scope + ["<<self"]).join("::"), name]] << line if name
      return
    when :def
      name, line = method_name_and_line(node[1])
      seen[[scope.join("::"), name]] << line if name
      return
    end

    node.each { |child| walk(child, scope, seen, counter) }
  end

  def walk_children(node, scope, seen, counter)
    node.drop(1).each { |child| walk(child, scope, seen, counter) }
  end

  # Ripper renders an identifier as [:@ident, "name", [line, column]]; a constant
  # path as nested [:const_path_ref, ...] / [:var_ref, [:@const, "Name", ...]].
  def method_name_and_line(node)
    return [nil, nil] unless node.is_a?(Array)
    return [node[1], node[2].first] if node[1].is_a?(String) && node[2].is_a?(Array)

    node.each do |child|
      name, line = method_name_and_line(child)
      return [name, line] if name
    end
    [nil, nil]
  end

  def const_name(node)
    return "?" unless node.is_a?(Array)
    return node[1] if node[1].is_a?(String)

    node.filter_map { |child| const_name(child) if child.is_a?(Array) }.join("::").presence || "?"
  end
end
