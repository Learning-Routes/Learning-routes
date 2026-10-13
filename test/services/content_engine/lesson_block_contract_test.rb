require "test_helper"

# THE contract test.
#
# The vocabulary of lesson blocks is declared once in ContentEngine::LessonBlocks and
# consumed by the parser, the renderer, the partial dispatch and the prompts. Every
# assertion below pins one link in that chain, IN BOTH DIRECTIONS.
#
# Both directions is the whole point, and the lesson is recorded in WP5_HANDOFF.md §4:
# a subset assertion only ever catches drift in one direction, and a superset stuffed
# with junk still passes it. The failure this package exists to fix — prompts asking for
# eleven block types the parser knew nothing about — is exactly a one-directional gap.
class ContentEngine::LessonBlockContractTest < ActiveSupport::TestCase
  LB = ContentEngine::LessonBlocks
  PARSER = ContentEngine::LessonSectionParser
  RENDERER = ContentEngine::MarkdownRenderer

  PROMPTS_DIR = Rails.root.join("engines/ai_orchestrator/config/prompts")
  LESSON_PROMPT = PROMPTS_DIR.join("lesson_content.yml")
  CURRICULUM_PROMPT = PROMPTS_DIR.join("curriculum_design.yml")
  PARTIALS_DIR = Rails.root.join(
    "engines/learning_routes_engine/app/views/learning_routes_engine/steps/lesson_sections"
  )
  CONTROLLERS_DIR = Rails.root.join("app/javascript/controllers")

  def prompt_text(path)
    YAML.load_file(path).values_at("system_prompt", "user_prompt").compact.join("\n")
  end

  # ── Link 1: prompts → parser ────────────────────────────────────────────

  test "every ::: block the lesson prompt requests has a parser branch" do
    requested = prompt_text(LESSON_PROMPT).scan(/:::(\w+)/).flatten.uniq
    unrenderable = requested - LB.fence_types

    assert_equal [], unrenderable,
      "lesson_content.yml asks the model for #{unrenderable.inspect}, which no parser " \
      "branch handles. Blocks like these are dropped before the student sees them, " \
      "leaving a hole where an exercise should be. Either add them to " \
      "ContentEngine::LessonBlocks (with parser branch, partial and controller) or " \
      "stop requesting them."
  end

  test "every ## heading the lesson prompt requests maps to a known type" do
    requested = prompt_text(LESSON_PROMPT).scan(/^\s*##\s+([A-Za-zÁ-úñÑ]+):/).flatten.uniq
    unknown = requested - LB.heading_prefixes

    assert_equal [], unknown,
      "lesson_content.yml uses heading prefixes #{unknown.inspect} that " \
      "LessonSectionParser::HEADING_TYPE_MAP does not recognise — those sections " \
      "silently degrade to plain concept text."
  end

  # `authored: false` was, until this package, a declaration nothing enforced:
  # nothing derives the prompts from LessonBlocks and `authored_types` has no caller
  # outside lesson_blocks.rb. This is what makes it true.
  test "every authored heading type is requested by the lesson prompt" do
    requested = prompt_text(LESSON_PROMPT).scan(/^\s*##\s+([A-Za-zÁ-úñÑ]+):/).flatten.uniq
    authored = LB.authored_types.select { |t| LB::BLOCKS[t][:headings].any? }
    missing = authored.reject { |t| LB::BLOCKS[t][:headings].any? { |h| requested.include?(h) } }

    assert_equal [], missing,
      "declared authored (the model is expected to write them) but lesson_content.yml " \
      "never requests them: #{missing.inspect}. Either the prompt lost a block type, or " \
      "the type should be declared authored: false."
  end

  # ── Link 1c: the ## Motion: example → MotionScenes ──────────────────────
  #
  # The prompt's worked example is the FOURTH copy of a scene's shape (the other
  # three are the JSON schema, the generated TS type, and the scene's own
  # FALLBACK) — and the one nobody else would check. If it drifts from the
  # schema, the prompt teaches the model a shape the parser rejects.
  #
  # NOTE: the brief for this test used `YAML.load_file(...).to_s` to build
  # `body`. That calls Hash#to_s, which is Hash#inspect under the hood — it
  # ESCAPES every real newline in the YAML values into the two literal
  # characters "\" "n", so a regex `\n` (an actual newline) can never match
  # inside it. Verified: `{"a" => "x\ny"}.to_s` => '{"a"=>"x\ny"}' (backslash-n,
  # not a newline). Used `prompt_text`, this file's own helper, instead — it
  # joins the real string values, newlines intact, exactly like every other
  # test in this file already does.
  test "the ## Motion: example in the prompt validates against the schema its heading names" do
    body = prompt_text(LESSON_PROMPT)

    example = body[/## Motion:\s*(\w+)\s*\n(\{.*?\n\})/m]
    assert example, "the prompt has no ## Motion: example, so the model has nothing to imitate"
    scene = Regexp.last_match(1)
    payload = JSON.parse(Regexp.last_match(2))

    assert ContentEngine::MotionScenes.known?(scene), "the example names an unknown scene: #{scene}"
    assert_equal [], ContentEngine::MotionScenes.validate(scene, payload["data"]),
      "the prompt teaches the model a shape the parser will reject"
    assert payload["narration"].present?, "the example must show narration"
  end

  # The languages are the whole point of the example: the model imitates it.
  test "the prompt's motion example puts the target language in tokens and the student's in narration" do
    body = prompt_text(LESSON_PROMPT)
    payload = JSON.parse(body[/## Motion:\s*\w+\s*\n(\{.*?\n\})/m, 1])

    assert_includes payload["data"]["tokens"], "tenho",
      "tokens must be the TARGET language (pt); an English token here teaches the model to invert them"
    assert_match(/sujeto|persona/i, payload["narration"],
      "narration must be the STUDENT's language (es)")
  end

  # ── Link 1d: the cycle placement, pinned as text ─────────────────────────
  #
  # "Module 1 carries one, at most two motion blocks; other modules none" is a
  # content decision, not a structural one — nothing short of simulating the
  # model can prove it is OBEYED. What a test CAN pin, in the same spirit as
  # every other assertion in this file, is that the INSTRUCTION ITSELF is
  # still there, still names module 1, and still caps it at one or two: a
  # future edit that quietly drops the constraint (e.g. while rewording the
  # vocabulary entry) fails this test instead of silently going unnoticed.
  test "the curriculum prompt confines motion to module 1, one or two lessons" do
    text = prompt_text(CURRICULUM_PROMPT)
    section = text[/EXERCISE TYPE VOCABULARY.*?\n\s*={10,}\n(.*?)(?=\n\s*={10,})/m, 1].to_s

    motion_entry = section[/^motion\s+—.*(?:\n(?!\s*\w+\s+—)(?!\n).*)*/]
    assert motion_entry, "curriculum_design.yml's exercise vocabulary has no entry for motion"

    assert_match(/module 1/i, motion_entry,
      "the motion entry must confine it to module 1 — that placement decision is what this pins")
    assert_match(/one or two|one,? at most two/i, motion_entry,
      "the motion entry must cap it at one or two lessons")
  end

  test "the curriculum prompt's exercise vocabulary is renderable" do
    # The vocabulary block lists the exercise_types CurriculumBrain may plan. Each must
    # correspond to something the lesson writer can actually produce, or the plan
    # promises exercises the lesson cannot contain.
    text = prompt_text(CURRICULUM_PROMPT)
    # Body of the vocabulary block: skip the header's own ==== rule, stop at the next one.
    section = text[/EXERCISE TYPE VOCABULARY.*?\n\s*={10,}\n(.*?)(?=\n\s*={10,})/m, 1].to_s

    vocabulary = section.scan(/^(\w+)\s+—/).flatten.uniq
    assert vocabulary.any?, "could not locate the exercise vocabulary block"

    # Map the planner's vocabulary onto renderable block types.
    renderable = LB.types + %w[multiple_choice match complete playground]
    unknown = vocabulary - renderable

    assert_equal [], unknown,
      "curriculum_design.yml may plan #{unknown.inspect}, which maps to no renderable " \
      "block. CurriculumBrain would promise the student an exercise the lesson writer " \
      "cannot build."
  end

  test "the prompts no longer request any of the ten dead block types" do
    # Named explicitly so a revert is loud rather than subtle.
    dead = %w[
      tap_pairs listen_and_type word_bank translate_sentence speak_sentence
      terminal_exercise output_prediction bug_fix code_completion code_challenge
      drag_order image_label
    ]
    both = prompt_text(LESSON_PROMPT) + prompt_text(CURRICULUM_PROMPT)

    resurrected = dead.select { |t| both.match?(/\b#{Regexp.escape(t)}\b/) }

    assert_equal [], resurrected,
      "#{resurrected.inspect} is back in the prompts but still has no implementation. " \
      "If you built it, add it to ContentEngine::LessonBlocks and remove it from this list."
  end

  # ── Link 2: parser → LessonBlocks ───────────────────────────────────────

  test "the parser's fence vocabulary is exactly LessonBlocks'" do
    assert_equal LB.fence_types, PARSER::BLOCK_TYPES
  end

  test "the parser's heading map is exactly LessonBlocks'" do
    assert_equal LB.heading_map, PARSER::HEADING_TYPE_MAP
  end

  test "every type the parser can emit is declared in LessonBlocks" do
    # Reverse direction: a parser branch producing a type nobody declared would have no
    # partial and would silently degrade to concept.
    emitted = File.read(PARSER.instance_method(:parse).source_location.first)
                  .scan(/type:\s*"(\w+)"/).flatten.uniq
    undeclared = emitted - LB.types

    assert_equal [], undeclared,
      "LessonSectionParser emits #{undeclared.inspect}, which ContentEngine::LessonBlocks " \
      "does not declare — those sections render as generic concept blocks."
  end

  # ── Link 3: LessonBlocks → partials ─────────────────────────────────────

  test "every declared type has a partial on disk" do
    missing = LB.types.reject { |t| File.exist?(PARTIALS_DIR.join("_#{LB.partial_for(t)}.html.erb")) }

    assert_equal [], missing,
      "no partial for #{missing.inspect} — the section would raise or fall back to concept"
  end

  test "every partial on disk is a declared type" do
    on_disk = Dir.children(PARTIALS_DIR)
                 .grep(/\A_(\w+)\.html\.erb\z/) { Regexp.last_match(1) }
    # Shared sub-partials rendered BY other sections, not section types of their
    # own: the audio player, and `aftermath` — the lesson content an author put
    # after an interactive block, which the five accumulating parsers used to
    # swallow and now hand over separately.
    orphans = on_disk - LB.types - %w[section_audio_player aftermath]

    assert_equal [], orphans,
      "#{orphans.inspect} exist as partials but are not declared in LessonBlocks — " \
      "either dead files, or a type the parser can never route to."
  end

  # ── Link 4: partials → Stimulus controllers ─────────────────────────────

  test "every data-action in every partial resolves to a real controller method" do
    # AUDIT.md §7 verified this property held; pinning it so it keeps holding. A
    # data-action naming a method that does not exist fails silently in the browser.
    broken = []

    LB.types.each do |type|
      partial = PARTIALS_DIR.join("_#{LB.partial_for(type)}.html.erb")
      next unless File.exist?(partial)

      File.read(partial).scan(/data-action="([^"]+)"/).flatten.each do |spec|
        spec.split(/\s+/).each do |binding|
          # Stimulus accepts both the explicit "event->controller#method" form and
          # the shorthand "controller#method" (implied default event, e.g. "click"
          # on a button). Only the explicit form was parsed here, so a shorthand
          # binding naming a nonexistent method passed this test silently.
          target = binding.include?("->") ? binding.split("->").last : binding
          next unless target.include?("#")

          controller, method = target.split("#")
          next if controller.nil? || method.nil?

          file = CONTROLLERS_DIR.join("#{controller.tr('-', '_')}_controller.js")
          unless File.exist?(file)
            broken << "#{type}: no controller #{controller}"
            next
          end

          unless File.read(file).match?(/^\s*(async\s+)?#{Regexp.escape(method)}\s*\(/)
            broken << "#{type}: #{controller}##{method} does not exist"
          end
        end
      end
    end

    assert_equal [], broken, "dead Stimulus bindings: #{broken.inspect}"
  end

  # ── Link 5: LessonBlocks → renderer ─────────────────────────────────────

  test "renderer chrome is exactly LessonBlocks' chrome" do
    assert_equal LB.renderer_chrome, RENDERER::INTERACTIVE_BLOCKS
  end

  test "every renderer chrome entry is a declared fence type" do
    undeclared = RENDERER::INTERACTIVE_BLOCKS.keys - LB.fence_types
    assert_equal [], undeclared
  end

  # ── Link 6: the leak itself, asserted as behaviour ──────────────────────

  test "no ::: marker survives rendering for any DECLARED type" do
    leaked = LB.fence_types.reject do |type|
      html = RENDERER.render(":::#{type} Title\nSome body content.\n:::")
      !html.include?(":::")
    end

    assert_equal [], leaked, "declared types leaking a raw ::: marker: #{leaked.inspect}"
  end

  test "no ::: marker survives rendering for an UNDECLARED type" do
    # The regression itself. This is what reached students as ":::tap_pairs".
    html = RENDERER.render(":::tap_pairs\npairs:\n  - [\"Hello\", \"Olá\"]\n:::")

    assert_not html.include?(":::"), "raw ::: marker leaked to the rendered output"
    assert_not html.include?("tap_pairs"), "unknown block type name leaked to the rendered output"
  end

  test "the parser drops an undeclared block rather than emitting it as text" do
    sections = PARSER.call("## Concepto: Intro\nReal content here.\n\n:::tap_pairs\npairs:\n  - [\"a\",\"b\"]\n:::")
    serialized = sections.map { |s| s.values.join(" ") }.join(" ")

    assert_not serialized.include?(":::"), "parser leaked a raw ::: marker into a section"
    assert_not serialized.include?("tap_pairs"), "parser leaked the unknown block name"
  end

  # ── Hygiene ─────────────────────────────────────────────────────────────

  test "declared types are unique, well-formed identifiers" do
    assert_equal LB.types.uniq, LB.types
    malformed = LB.types.reject { |t| t.match?(/\A[a-z][a-z0-9_]*\z/) }
    assert_equal [], malformed
  end

  test "heading prefixes are unique across types" do
    # A prefix mapping to two types would silently resolve to whichever was declared last.
    all = LB.heading_prefixes
    assert_equal all.uniq, all, "duplicate heading prefix: #{(all - all.uniq).uniq.inspect}"
  end
end
