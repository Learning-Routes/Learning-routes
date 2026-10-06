require "test_helper"
require "json"
require "open3"

# WP-37 §2. The map's geometry is a pure module, asserted under node without a
# browser — the same arrangement WP-35 used, in `bin/rails test`.
#
# Every assertion is computed HERE from the raw boxes and polylines, never by a
# helper exported from the module under test.
class JourneyMapLayoutTest < ActiveSupport::TestCase
  MODULE_PATH = Rails.root.join("app/javascript/lib/journey_map_layout.js")
  EPS = 0.5

  # ── Shapes ──────────────────────────────────────────────────────────
  def self.topic(id, reinforcement: false, parent_id: nil)
    { "id" => id, "name" => "Tema #{id}", "status" => "available", "progress" => 0,
      "reinforcement" => reinforcement, "parent_id" => parent_id, "current" => false, "path" => "/x" }
  end

  def self.stage(id, primaries:, fans: {}, orphans: 0, readable: true)
    topics = []
    orphans.times { |i| topics << topic("#{id}-o#{i}", reinforcement: true) }
    primaries.times do |i|
      pid = "#{id}-p#{i}"
      topics << topic(pid)
      fans.fetch(i, 0).times { |j| topics << topic("#{pid}-r#{j}", reinforcement: true, parent_id: pid) }
    end
    { "module_id" => id, "level" => "nv1", "label" => "Módulo #{id}", "tag" => "NV1",
      "status" => readable ? "current" : "locked", "readable" => readable, "topics" => topics }
  end

  SHAPES = {}.tap do |shapes|
    [1, 7, 8, 20, 43].product([1, 2, 5]).each do |count, modules|
      shapes["#{count} steps x #{modules} modules"] =
        (0...modules).map { |m| stage("m#{m}", primaries: count) }
    end
    shapes["43 peers"] = [stage("m0", primaries: 43)]
    shapes["7 + 36 behind one step"] = [stage("m0", primaries: 7, fans: { 2 => 36 })]
    shapes["production 7 + 13"] = [stage("m0", primaries: 7, fans: { 1 => 3, 2 => 3, 4 => 7 })]
    shapes["orphans then fans"] = [stage("m0", primaries: 5, orphans: 2, fans: { 0 => 2, 3 => 4 })]
    shapes["two fans in one row"] = [stage("m0", primaries: 4, fans: { 0 => 3, 3 => 3 })]
    shapes["preview + locked"] = [stage("m0", primaries: 7, fans: { 2 => 3 }), stage("m1", primaries: 9, readable: false)]
  end.freeze

  # ── Per-shape invariants ────────────────────────────────────────────
  SHAPES.each do |name, stages|
    test "#{name}: no two node boxes intersect" do
      boxes = solid_nodes(layout(stages))
      pair = first_pair(boxes) { |a, b| intersect?(a, b) }
      assert_nil pair, "nodes #{pair&.map { |n| n['id'] }.inspect} overlap"
    end

    test "#{name}: no two subtree boxes intersect" do
      pair = first_pair(layout(stages)["cells"]) { |a, b| intersect?(a, b) }
      assert_nil pair, "subtrees #{pair&.map { |c| c['id'] }.inspect} overlap"
    end

    test "#{name}: no edge crosses a node box except its own two endpoints" do
      result = layout(stages)
      boxes = solid_nodes(result)
      result["edges"].each do |edge|
        edge["points"].each_cons(2) do |p, q|
          hit = boxes.find { |b| b["id"] != edge["from"] && b["id"] != edge["to"] && segment_hits?(p, q, b) }
          assert_nil hit, "#{edge['kind']} edge #{edge['from']}->#{edge['to']} crosses #{hit&.dig('id')}"
        end
      end
    end

    test "#{name}: nodes come back in route order" do
      ids = layout(stages)["nodes"].select { |n| %w[step reinforcement].include?(n["kind"]) }.map { |n| n["id"] }
      expected = stages.flat_map { |s| s["topics"].map { |t| "s:#{t['id']}" } }
      assert_equal expected, ids
    end

    test "#{name}: one edge per connection, and every endpoint exists" do
      result = layout(stages)
      ids = result["nodes"].map { |n| n["id"] }.to_set
      result["edges"].each do |e|
        assert_includes ids, e["from"]
        assert_includes ids, e["to"]
      end
      assert_equal expected_edge_count(stages), result["edges"].size
    end

    test "#{name}: the spine column and the row gutters hold no step" do
      result = layout(stages)
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

    test "#{name}: rows stack below the tallest subtree; modules below the lowest box" do
      result = layout(stages)
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

  test "a label width is an option, and the box the layout spaces by includes it" do
    wide = layout([self.class.stage("m0", primaries: 2)], { labelWidth: 240 })
    assert wide["nodes"].select { |n| n["kind"] == "step" }.all? { |n| n["w"] == 240 }
  end

  private

  def layout(stages, overrides = {})
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
