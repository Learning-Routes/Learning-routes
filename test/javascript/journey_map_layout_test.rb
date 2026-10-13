require "test_helper"
require "json"
require "open3"
require_relative "journey_shapes"

# WP-37 §2. The map's geometry is a pure module, asserted under node without a
# browser — the same arrangement WP-35 used, in `bin/rails test`.
#
# Every assertion is computed HERE from the raw boxes and polylines, never by a
# helper exported from the module under test.
class JourneyMapLayoutTest < ActiveSupport::TestCase
  MODULE_PATH = Rails.root.join("app/javascript/lib/journey_map_layout.js")
  EPS = 0.5

  # ── Shapes (shared with journey_map_paths_test.rb) ──────────────────
  SHAPES = JourneyShapes::SHAPES
  VIEW = JourneyShapes::VIEW
  def self.stage(...) = JourneyShapes.stage(...)


  OPTION_SETS = { "defaults" => {}, "wave 16" => { wave: 16 }, "view" => VIEW }.freeze

  # WP-37b §2: with every default the output is WP-37's, BYTE FOR BYTE. SHA-256 of
  # JSON.stringify(layoutJourney(buildTree({ title: "Ruta" }, stages), {})) as produced
  # by b907fea9's module. To regenerate (only if WP-37's picture itself is meant to
  # change): `git show b907fea9:app/javascript/lib/journey_map_layout.js > /tmp/old.mjs`
  # and hash its output over SHAPES the same way `digest` below does.
  WP37_DIGESTS = {
    "1 steps x 1 modules" => "2b97e43a24b230a9988c289189fa253bf1d147223a4220906ce12dbe61d0661b",
    "1 steps x 2 modules" => "89afb3e3ef547f6d289a63e156b32970b1c6a95f904dd89c807bbb52edb54dfd",
    "1 steps x 5 modules" => "6496896decc426f2014776f9fac34d10c8306be1ec0b8a419408ce4b5d3f5a3d",
    "7 steps x 1 modules" => "9ebc502d89729b7100c57c15e8191f074525e48cbc19cdd52713c34687fb8253",
    "7 steps x 2 modules" => "90afb4fe8334df0d93e30883ec23f4c1df4957d09181bc0e5e8e87c14eb55fc6",
    "7 steps x 5 modules" => "cc5bec5644dffb19f11645250649ca39916d9777070f8d9e29cbb1c91ed577c5",
    "8 steps x 1 modules" => "bee1c16290c395e5ca43f37532c59ae3dc3ccd4bfbb09c589d6fb92003a3802d",
    "8 steps x 2 modules" => "48293ba984db87dec7e20434697a9cc068586f3d824a4dd9dd0966431a7fa864",
    "8 steps x 5 modules" => "67e135a6f909b606491c0bdf2733e102695be4e758039648d8205bfb3b59538b",
    "20 steps x 1 modules" => "0f14a4160a70f79ccc450bf8e2bb724a72022402cca2e8bcd41b2ba94a0c2ba7",
    "20 steps x 2 modules" => "cc75c57ad8c73dc2fa5073b0ba80f9a0089ecaa1fa512bb620b6187c37e78038",
    "20 steps x 5 modules" => "55b68baed91680d69c6cba2b3abb8aa76b461822bf64c8d6cdaba40810ed585b",
    "43 steps x 1 modules" => "469f237c3cf81f425554f7d50b72c23127783b3d3bb8e3a79617dee57b516c8f",
    "43 steps x 2 modules" => "b66677f5da2b8a49dfedda1890034f6b1803b83f4ac6e94870f3ccf7657367a5",
    "43 steps x 5 modules" => "09ff37861987636df5d4ceba10f19d0eb000884d736d35f4d7c0bb7397d0b916",
    "43 peers" => "469f237c3cf81f425554f7d50b72c23127783b3d3bb8e3a79617dee57b516c8f",
    "7 + 36 behind one step" => "9625e87b08adf8b0e1f43da325b613dad608efabe724a92bdb60df28cd32e2de",
    "production 7 + 13" => "00ef8e0599818ca8ea88d0d158bef68e94d087566888d329491aac97b3161368",
    "orphans then fans" => "95949679a6449f3531598be862471ae349b5181d0163df54ba4a8c97f9d3290d",
    "two fans in one row" => "b36e88bc21bdbb317078c8fa439b9b1066bdbc7db998b3dd2b7f2e0a6d13359b",
    "fan under an ltr row end" => "b26c390e7c321d73e3af5aaa54b1b8548fc3b1c8407e6a9f04c4963c44440028",
    "fan under an rtl row end" => "73e8bd594fad9e55da4761c2b8d26f41068603ecebd8103ef3ce2cb8e4e91628",
    "preview + locked" => "2737fd5b1652a806da4a66456ff42ed4899e55c023526e167deec0d9df2623f9"
  }.freeze

  SHAPES.each do |name, stages|
    test "#{name}: with every default the output is WP-37's, byte for byte" do
      assert_equal WP37_DIGESTS.fetch(name), digest(stages)
    end
  end

  # ── Per-shape invariants, under every option set ────────────────────
  OPTION_SETS.each do |set, opts|
    SHAPES.each do |shape, stages|
      name = "#{shape} [#{set}]"
      test "#{name}: no two node boxes intersect" do
        boxes = solid_nodes(layout(stages, opts))
        pair = first_pair(boxes) { |a, b| intersect?(a, b) }
        assert_nil pair, "nodes #{pair&.map { |n| n['id'] }.inspect} overlap"
      end

      test "#{name}: no two subtree boxes intersect" do
        pair = first_pair(layout(stages, opts)["cells"]) { |a, b| intersect?(a, b) }
        assert_nil pair, "subtrees #{pair&.map { |c| c['id'] }.inspect} overlap"
      end

      test "#{name}: no edge crosses a node box except its own two endpoints" do
        result = layout(stages, opts)
        boxes = solid_nodes(result)
        result["edges"].each do |edge|
          edge["points"].each_cons(2) do |p, q|
            hit = boxes.find { |b| b["id"] != edge["from"] && b["id"] != edge["to"] && segment_hits?(p, q, b) }
            assert_nil hit, "#{edge['kind']} edge #{edge['from']}->#{edge['to']} crosses #{hit&.dig('id')}"
          end
        end
      end

      test "#{name}: nodes come back in route order" do
        ids = layout(stages, opts)["nodes"].select { |n| %w[step reinforcement].include?(n["kind"]) }.map { |n| n["id"] }
        expected = stages.flat_map { |s| s["topics"].map { |t| "s:#{t['id']}" } }
        assert_equal expected, ids
      end

      # The direction cue: a row read right-to-left still says which way is forward.
      test "#{name}: each primary step carries its 1-based place among its module's primary steps" do
        ordinals = layout(stages, opts)["nodes"].select { |n| n.key?("ordinal") }.to_h { |n| [n["id"], n["ordinal"]] }
        expected = stages.flat_map do |s|
          s["topics"].reject { |t| t["reinforcement"] }.each_with_index.map { |t, i| ["s:#{t['id']}", i + 1] }
        end.to_h
        assert_equal expected, ordinals
      end

      test "#{name}: one edge per connection, and every endpoint exists" do
        result = layout(stages, opts)
        ids = result["nodes"].map { |n| n["id"] }.to_set
        result["edges"].each do |e|
          assert_includes ids, e["from"]
          assert_includes ids, e["to"]
        end
        assert_equal expected_edge_count(stages), result["edges"].size
      end

      test "#{name}: the spine column and the row gutters hold no step" do
        result = layout(stages, opts)
        steps = result["nodes"].select { |n| %w[step reinforcement].include?(n["kind"]) }
        result["modules"].each do |mod|
          half = mod["spineHalf"]
          lanes = [[-half, half], mod["gutters"]["left"], mod["gutters"]["right"]]
          # The spine column is every module's; a module's gutters are its own (a
          # wider module below may legitimately put cells at that x).
          steps.select { |n| n["moduleId"] == mod["id"] }.each do |node|
            lanes.each do |x0, x1|
              overlapping = node["x"] < x1 - EPS && x0 < node["x"] + node["w"] - EPS
              refute overlapping, "#{node['id']} sits in a reserved lane [#{x0}, #{x1}]"
            end
          end
        end
      end

      # Computed from node boxes only: a hop between rows runs its vertical segment
      # outside the x-range of every step and reinforcement box of its module.
      test "#{name}: a row-to-row hop runs in a gutter, beside every box" do
        result = layout(stages, opts)
        nodes = result["nodes"].index_by { |n| n["id"] }
        result["edges"].select { |e| e["kind"] == "route" && e["points"].size > 2 }.each do |edge|
          x = edge["points"][1][0]
          boxes = result["nodes"].select do |n|
            n["moduleId"] == nodes[edge["from"]]["moduleId"] && %w[step reinforcement].include?(n["kind"])
          end
          inside = boxes.find { |b| x > b["x"] - EPS && x < b["x"] + b["w"] + EPS }
          assert_nil inside, "hop #{edge['from']}->#{edge['to']} at x=#{x} runs through the column of #{inside&.dig('id')}"
        end
      end

      test "#{name}: rows stack below the tallest subtree; modules below the lowest box" do
        result = layout(stages, opts)
        cells = result["cells"].index_by { |c| c["id"] }
        result["modules"].each do |mod|
          mod["rows"].each_cons(2) do |above, below|
            lowest = above["heads"].map { |id| cells[id]["y"] + cells[id]["h"] }.max
            assert_operator below["top"], :>=, lowest - EPS
          end
        end
        result["modules"].each_cons(2) do |a, b|
          assert_operator b["box"]["y"], :>=, a["box"]["y"] + a["box"]["h"] - EPS
        end
      end
    end
  end

  # ── Rules that need a specific shape ────────────────────────────────
  test "four steps lie in one row beside the module; five wrap below it" do
    four = layout([self.class.stage("m0", primaries: 4)])
    mod = four["nodes"].find { |n| n["kind"] == "module" }
    assert_equal 1, four["modules"].first["rows"].size
    four["nodes"].select { |n| n["kind"] == "step" }.each { |n| assert_in_delta mod["cy"], n["cy"], 0.01 }

    five = layout([self.class.stage("m0", primaries: 5)])
    mod5 = five["nodes"].find { |n| n["kind"] == "module" }
    rows = five["modules"].first["rows"]
    assert_equal 2, rows.size
    assert_operator rows.first["top"], :>=, mod5["y"] + mod5["h"]
  end

  test "rows alternate direction, so route order reads as one path" do
    result = layout([self.class.stage("m0", primaries: 20)])
    nodes = result["nodes"].index_by { |n| n["id"] }
    result["modules"].first["rows"].each_with_index do |row, i|
      xs = row["heads"].map { |id| nodes[id]["cx"] }
      assert_equal(i.even? ? "ltr" : "rtl", row["direction"])
      assert_equal(i.even? ? xs.sort : xs.sort.reverse, xs)
    end
  end

  test "a reinforcement is drawn as a child, not a peer" do
    result = layout([self.class.stage("m0", primaries: 1, fans: { 0 => 3 })])
    steps = result["nodes"].select { |n| n["kind"] == "step" }
    kids = result["nodes"].select { |n| n["kind"] == "reinforcement" }
    assert_equal 1, steps.size
    assert_equal 3, kids.size
    fan_edges = result["edges"].select { |e| e["kind"] == "fan" }
    assert_equal [steps.first["id"]] * 3, fan_edges.map { |e| e["from"] }
    kids.each { |k| assert_operator k["y"], :>, steps.first["y"] + steps.first["h"] }
  end

  test "a parent is centred over its fan, and identical subtrees are identical" do
    result = layout([self.class.stage("m0", primaries: 4, fans: { 0 => 3, 3 => 3 })])
    nodes = result["nodes"]
    %w[m0-p0 m0-p3].each do |pid|
      parent = nodes.find { |n| n["id"] == "s:#{pid}" }
      kids = nodes.select { |n| n["id"].start_with?("s:#{pid}-r") }
      span = [kids.map { |k| k["x"] }.min, kids.map { |k| k["x"] + k["w"] }.max]
      assert_in_delta (span[0] + span[1]) / 2.0, parent["cx"], 0.01
    end
    a, b = result["cells"].select { |c| c["children"] == 3 }
    assert_equal [a["w"], a["h"]], [b["w"], b["h"]]
  end

  test "thirty-six reinforcement steps wrap into a fan, not a line" do
    result = layout(SHAPES["7 + 36 behind one step"])
    kids = result["nodes"].select { |n| n["kind"] == "reinforcement" }
    assert_equal 3, kids.map { |k| k["x"] }.uniq.size
    assert_equal 12, kids.map { |k| k["y"] }.uniq.size
  end

  # Owner's ruling (CP2): a bad option must THROW. A browser hang (rowSize 0
  # loops forever in chunk) or a NaN map is worse than an exception.
  [{ rowSize: 0 }, { fanRowSize: 0 }, { rowSize: 2.5 }, { labelWidth: nil }, { gutter: "wide" }].each do |bad|
    test "a bad option is refused: #{bad.inspect}" do
      script = <<~JS
        import(#{MODULE_PATH.to_s.to_json}).then((m) => {
          const tree = m.buildTree({ title: "R" }, #{[self.class.stage("m0", primaries: 2)].to_json})
          try { m.layoutJourney(tree, #{bad.to_json}); process.stdout.write("no-throw") }
          catch (e) { process.stdout.write("threw: " + e.message) }
        })
      JS
      stdout, stderr, status = Open3.capture3("node", "--input-type=module", "-e", script)
      assert status.success?, stderr
      assert_match(/\Athrew: /, stdout, "#{bad.inspect} was accepted")
    end
  end

  test "a label width is an option, and the box the layout spaces by includes it" do
    wide = layout([self.class.stage("m0", primaries: 2)], { labelWidth: 240, moduleLabelWidth: 200 })
    assert wide["nodes"].select { |n| n["kind"] == "step" }.all? { |n| n["w"] == 240 }
    assert_equal [200], wide["nodes"].select { |n| n["kind"] == "module" }.map { |n| n["w"] }
  end

  # WP-37b §2.2: a module label wider than a step label is RESERVED in the spine
  # column, not painted over the gutter.
  test "a module label width is reserved in the spine column" do
    stages = [self.class.stage("m0", primaries: 9, fans: { 2 => 3 }), self.class.stage("m1", primaries: 3)]
    result = layout(stages, { moduleLabelWidth: 160, labelWidth: 124 })
    result["modules"].each { |mod| assert_equal 80, mod["spineHalf"] }
    result["nodes"].select { |n| n["kind"] == "module" }.each do |mod|
      assert_equal 160, mod["w"]
      assert_equal(-80, mod["x"])
    end
    result["nodes"].select { |n| %w[step reinforcement].include?(n["kind"]) }.each do |n|
      assert_operator n["x"], :>=, 80 - EPS, "#{n['id']} reaches into the spine column"
    end
  end

  # WP-37b §2.1: the route undulates — and every box keeps its reserved space.
  SHAPES.each do |name, stages|
    test "#{name}: wave — consecutive heads in a row differ by 2·wave, and each row grew by 2·wave" do
      flat = layout(stages, {})
      wavy = layout(stages, { wave: 16 })
      flat_nodes = flat["nodes"].index_by { |n| n["id"] }
      wavy_nodes = wavy["nodes"].index_by { |n| n["id"] }
      flat["modules"].zip(wavy["modules"]).each do |fm, wm|
        fm["rows"].zip(wm["rows"]).each do |frow, wrow|
          assert_in_delta frow["bottom"] - frow["top"] + 32, wrow["bottom"] - wrow["top"], 1e-9
          wrow["heads"].each_cons(2) do |a, b|
            assert_in_delta 32, (wavy_nodes[a]["cy"] - wavy_nodes[b]["cy"]).abs, 1e-9, "#{a} -> #{b}"
          end
          # Even cells sit on the row's top, exactly where wave 0 puts them.
          wrow["heads"].each_with_index do |id, i|
            next unless i.even?
            assert_in_delta flat_nodes[id]["cy"] - frow["top"], wavy_nodes[id]["cy"] - wrow["top"], 1e-9
          end
        end
      end
    end
  end

  # WP-37b §2.3: the title sits beside the spine's origin, not centred on it.
  test "rootX places the root's left edge; the spine still starts at x = 0" do
    result = layout([self.class.stage("m0", primaries: 3)], { rootX: 18, rootWidth: 420 })
    root = result["nodes"].find { |n| n["kind"] == "root" }
    assert_equal 18, root["x"]
    assert_equal 18 + 210, root["cx"]
    spine = result["edges"].find { |e| e["kind"] == "spine" }
    assert_equal [0, 0], spine["points"].map(&:first)
  end

  # The prompt's test 5: one layout module, not two.
  test "the old satellite layout is gone" do
    refute File.exist?(Rails.root.join("app/javascript/lib/journey_layout.js")),
      "journey_layout.js still exists beside journey_map_layout.js"
    refute_match(/pin "journey_layout"/, Rails.root.join("config/importmap.rb").read)
  end

  private

  # Each (stages, options) pair is laid out once per process: the invariants run
  # under three option sets, and node spawns are the cost.
  LAYOUTS = {} # rubocop:disable Style/MutableConstant

  def layout(stages, overrides = {})
    LAYOUTS[[stages, overrides].to_json] ||= run_layout(stages, overrides).freeze
  end

  def digest(stages)
    script = <<~JS
      import { createHash } from "node:crypto"
      import(#{MODULE_PATH.to_s.to_json}).then((m) => {
        const tree = m.buildTree({ title: "Ruta" }, #{stages.to_json})
        process.stdout.write(createHash("sha256").update(JSON.stringify(m.layoutJourney(tree, {}))).digest("hex"))
      })
    JS
    stdout, stderr, status = Open3.capture3("node", "--input-type=module", "-e", script)
    assert status.success?, "node failed: #{stderr}"
    stdout
  end

  def run_layout(stages, overrides)
    script = <<~JS
      import(#{MODULE_PATH.to_s.to_json}).then((m) => {
        const tree = m.buildTree({ title: "Ruta" }, #{stages.to_json})
        process.stdout.write(JSON.stringify(m.layoutJourney(tree, #{overrides.to_json})))
      })
    JS
    stdout, stderr, status = Open3.capture3("node", "--input-type=module", "-e", script)
    assert status.success?, "node failed: #{stderr}"
    JSON.parse(stdout)
  end

  def solid_nodes(result) = result["nodes"].select { |n| n["w"].positive? && n["h"].positive? }

  def intersect?(a, b)
    a["x"] < b["x"] + b["w"] - EPS && b["x"] < a["x"] + a["w"] - EPS &&
      a["y"] < b["y"] + b["h"] - EPS && b["y"] < a["y"] + a["h"] - EPS
  end

  def first_pair(items)
    items.each_with_index do |a, i|
      items.drop(i + 1).each { |b| return [a, b] if yield(a, b) }
    end
    nil
  end

  # Liang–Barsky against the box shrunk by EPS: touching an edge is not a crossing.
  def segment_hits?(p, q, box)
    x0, y0 = p
    dx = q[0] - x0
    dy = q[1] - y0
    t0 = 0.0
    t1 = 1.0
    [[-dx, x0 - (box["x"] + EPS)], [dx, (box["x"] + box["w"] - EPS) - x0],
     [-dy, y0 - (box["y"] + EPS)], [dy, (box["y"] + box["h"] - EPS) - y0]].each do |pp, qq|
      if pp.zero?
        return false if qq.negative?
      else
        r = qq / pp.to_f
        pp.negative? ? (t0 = [t0, r].max) : (t1 = [t1, r].min)
        return false if t0 > t1
      end
    end
    true
  end

  # spine: one per module (root→first, then module→next); per module:
  # module→first cell, route edges between consecutive cells, one fan edge per
  # reinforcement. Cells = primaries + 1 anchor when orphans exist.
  def expected_edge_count(stages)
    stages.sum do |stage|
      topics = stage["topics"]
      reinforcement = topics.count { |t| t["reinforcement"] }
      primaries = topics.count { |t| !t["reinforcement"] }
      orphans = topics.count { |t| t["reinforcement"] && t["parent_id"].nil? }
      cells = primaries + (orphans.positive? ? 1 : 0)
      1 + (cells.positive? ? 1 : 0) + [cells - 1, 0].max + reinforcement
    end
  end
end
