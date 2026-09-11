require "test_helper"

# THE CLASS: a language is baked into a scene every route renders.
#
# The 4 September demo hardcoded 'SUJETO' and 'VERBO' in agreement.tsx — a
# Spanish lesson compiled into the artifact, wrong for a Portuguese-for-English
# route and invisible until someone read the TypeScript. Displayed strings reach
# a scene through `data` (as transform's `tag` already does) or an i18n bag at
# mount. Never a literal.
class MotionSceneChromeTest < ActiveSupport::TestCase
  SCENES = Rails.root.glob("app/motion/src/scenes/*.tsx")

  # The rule flags any quoted string of two or more characters. These are the
  # ones that are legal, measured against the demo scenes — adding to this list
  # is a change to the contract and needs a reason in the commit, not a quiet
  # append.
  HEX          = /\A#?\h{2,8}\z/                      # '#1C1812' and the '1E'/'22' alpha fragments
  # Requires an actual module-path shape (a leading './', '../', or '@'), not
  # merely word characters — a bare %r{\A[@\w./-]+\z} matches ANY plain word
  # (e.g. 'SUJETO') because \w alone already satisfies it without a slash or
  # '@' ever appearing. That gap is exactly the bug this file exists to catch,
  # so it must not be reintroduced here; verified against the inventory below.
  MODULE_SPEC  = %r{\A(?:\.{1,2}/|@)[\w./-]*\z}       # '@motion-canvas/2d', './agreement.schema.json'
  FONT_STACK   = /\A[A-Za-z0-9 ,'-]*(?:sans-serif|monospace|system-ui)\z/
  # "right" is measured in transform.tsx (Txt textAlign="right" on the tag
  # column) — it belongs here alongside the other Layout/Txt enum values, not
  # bolted on separately, or the allowlist would silently drift from what it
  # documents.
  LAYOUT_ENUM  = %w[row column center start end stretch baseline row-reverse column-reverse right].freeze
  SCENE_NAMES  = %w[agreement transform words onToken].freeze

  def allowed?(literal)
    literal.match?(HEX) || literal.match?(MODULE_SPEC) || literal.match?(FONT_STACK) ||
      LAYOUT_ENUM.include?(literal) || SCENE_NAMES.include?(literal)
  end

  # Comments are stripped first: the demo says `reads as "in product"` and
  # `the "no"` in prose ABOUT the code, and flagging those would make the test
  # noise that gets disabled.
  def code_of(path)
    File.read(path).gsub(%r{/\*.*?\*/}m, "").gsub(%r{//[^\n]*}, "")
  end

  # NOTE on the nested-quote trap: the font stack is a DOUBLE-quoted string
  # containing nested SINGLE-quoted font names, e.g.
  #   "'DM Sans', 'Hiragino Sans GB', ..., system-ui, sans-serif"
  # This scanner's alternation tries the single-quote branch first at each
  # starting position, but that branch only matches where the character AT
  # that position is itself a single quote. At the position of the font
  # stack's outer double quote, only the double-quote branch can start a
  # match, and — because there is no bare `"` anywhere inside the stack — it
  # greedily consumes the WHOLE string through the closing double quote as
  # one literal, never re-entering to split out the single-quoted names
  # inside it. So no font-family allowlisting is needed beyond FONT_STACK
  # matching the full stack string; verified directly against both scenes
  # (see the report) rather than assumed.
  def literals_of(code)
    code.scan(/'([^']{2,})'|"([^"]{2,})"/).flatten.compact.uniq
  end

  test "the sweep is looking at the scenes it thinks it is" do
    assert_operator SCENES.size, :>=, 2, "the scene glob stopped matching app/motion/src/scenes"
  end

  SCENES.each do |path|
    test "#{File.basename(path)} contains no displayed literal" do
      offenders = literals_of(code_of(path)).reject { |s| allowed?(s) }

      assert_equal [], offenders.sort,
        "these are displayed strings compiled into the scene. Move them into the " \
        "scene's schema as data (see data.labels) so the generator writes them in " \
        "the route's languages."
    end
  end
end
