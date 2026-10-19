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
  # There is NO colour entry in this allowlist, and that absence is the
  # Checkpoint 2 ruling (STEP_27_WP36_NARRATED_SCENES.md, 12 September).
  # It used to hold HEX = /\A#\h{3,8}\z/, admitting '#1C1812' and 8-digit
  # alpha colours like '#C0453A22'. That admission is exactly what let both
  # scenes bake the light palette in: the canvas drew correct ink on the
  # app's dark theme and the student saw nothing — present in the DOM,
  # invisible on screen, the WP-33/WP-35 class of defect.
  #
  # The rule now: the scene has no colours of its own. Every colour arrives
  # in the `theme` bag that motion_scene_controller.js reads off the page's
  # CSS custom properties at mount. A colour literal in a .tsx is the same
  # kind of failure as a displayed string literal — a palette compiled into
  # the artifact, wrong for half the users, and invisible until someone reads
  # the TypeScript. Re-adding a colour pattern here reopens that defect.
  # Requires an actual module-path shape (a leading './', '../', or '@'), not
  # merely word characters — a bare %r{\A[@\w./-]+\z} matches ANY plain word
  # (e.g. 'SUJETO') because \w alone already satisfies it without a slash or
  # '@' ever appearing. That gap is exactly the bug this file exists to catch,
  # so it must not be reintroduced here; verified against the inventory below.
  MODULE_SPEC  = %r{\A(?:\.{1,2}/|@)[\w./-]*\z}       # '@motion-canvas/2d', './agreement.schema.json'
  # An equality check, not a pattern: a regex built from character classes
  # (e.g. /\A[A-Za-z0-9 ,'-]*(?:sans-serif|monospace|system-ui)\z/) also
  # passes plain prose that happens to end in one of those words — "Please
  # use system-ui" matches it. The Global Constraint is that every fontFamily
  # in every scene uses this EXACT stack, so checking for exactly that string
  # is strictly tighter AND enforces the constraint itself: a scene that
  # changes its font stack now fails this test. This equality is deliberate,
  # not a shortcut — extending it back into a pattern would reopen the gap.
  FONT_STACK   = "'Archivo', 'Hiragino Sans GB', 'PingFang SC', 'Microsoft YaHei', " \
                 "'Noto Sans CJK SC', system-ui, sans-serif"
  # "right" is measured in transform.tsx (Txt textAlign="right" on the tag
  # column) — it belongs here alongside the other Layout/Txt enum values, not
  # bolted on separately, or the allowlist would silently drift from what it
  # documents.
  LAYOUT_ENUM  = %w[row column center start end stretch baseline row-reverse column-reverse right].freeze
  # The KEYS a scene reads out of `scene.variables` — its own name plus the
  # three shared bags. They are identifiers in a contract with main.ts, not
  # anything a student ever sees, and they are matched exactly, so this list
  # cannot be widened by accident. "theme" joins it with the Checkpoint 2
  # ruling: the colours move out of the scene and arrive under this key.
  SCENE_NAMES  = %w[agreement transform theme words onToken].freeze

  def allowed?(literal)
    literal.match?(MODULE_SPEC) || literal == FONT_STACK ||
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
  #   "'Archivo', 'Hiragino Sans GB', ..., system-ui, sans-serif"
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
        "these are values compiled into the scene. A displayed string moves into " \
        "the scene's schema as data (see data.labels) so the generator writes it " \
        "in the route's languages; a COLOUR moves into the `theme` bag the " \
        "controller reads off the page's CSS tokens, so the scene is legible in " \
        "both themes."
    end
  end
end
