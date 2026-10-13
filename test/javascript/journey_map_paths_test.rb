require "test_helper"
require "json"
require "open3"
require_relative "journey_shapes"

# WP-37b §3. What the map DRAWS is a pure module too: layout → SVG path strings,
# chevrons, panels. Node runs it; Ruby asserts on its output.
#
# The label boxes, the path grammar, the tangents and the expected counts are all
# computed HERE from the layout's raw boxes. The one thing taken from the module
# under test is `samplePath` (points along a path), and it has its own tests below.
class JourneyMapPathsTest < ActiveSupport::TestCase
  LAYOUT_PATH = Rails.root.join("app/javascript/lib/journey_map_layout.js")
  PATHS_PATH = Rails.root.join("app/javascript/lib/journey_map_paths.js")
  SHAPES = JourneyShapes::SHAPES
  VIEW = JourneyShapes::VIEW
  WAVES = [0, 16].freeze
  K = 0.55
  EPS = 1e-6

  # Several currents per shape: none, the first / third / last primary of the first
  # readable module, the first reinforcement (an orphan where the shape has one),
  # and the first primary of the last readable module when there are several.
  def self.currents(stages)
    readable = stages.select { |s| s["readable"] }
    first = readable.first
    return [nil] unless first

    primaries = first["topics"].reject { |t| t["reinforcement"] }
    reinforcement = readable.flat_map { |s| s["topics"] }.find { |t| t["reinforcement"] }
    later = readable.size > 1 ? readable.last["topics"].reject { |t| t["reinforcement"] }.first : nil
    [nil] + [primaries.first, primaries[2], primaries.last, reinforcement, later].compact.map { |t| t["id"] }.uniq
  end

  SHAPES.each do |shape, stages|
    WAVES.each do |wave|
      name = "#{shape} [wave #{wave}]"

      # The first variant (no current) is checked whole. Later ones differ only in what
      # is travelled or lit, so only those kinds are re-checked.
      test "#{name}: no drawn line passes through a label" do
        each_variant(stages, wave).with_index do |(run, variant), v|
          labels = label_boxes(run)
          kinds = v.zero? ? %w[spine route routeLocked trunk branch branchOn] : %w[spineTravelled travelled branchOn]
          kinds.each do |kind|
            variant["samples"][kind].each_with_index do |points, i|
              points.each do |x, y|
                hit = labels.find { |b| x > b[:x0] && x < b[:x1] && y > b[:y0] && y < b[:y1] }
                assert_nil hit, "#{kind}[#{i}] passes through the label of #{hit&.dig(:id)} at (#{x.round(1)}, #{y.round(1)}) " \
                                "with current #{variant['currentId'].inspect}"
              end
            end
          end
        end
      end

      test "#{name}: each module's route is one continuous path, without a corner" do
        run = runs(stages, wave).first
        nodes = run["layout"]["nodes"].index_by { |n| n["id"] }
        paths = run["variants"].first["paths"]
        drawn = paths["route"] + paths["routeLocked"]
        with_heads = run["layout"]["modules"].reject { |m| m["rows"].empty? }
        assert_equal with_heads.map { |m| m["id"] }.sort, drawn.map { |r| r["moduleId"] }.sort

        drawn.each do |route|
          mod = run["layout"]["modules"].find { |m| m["id"] == route["moduleId"] }
          last_head = nodes[mod["rows"].last["heads"].last]
          cmds = parse(route["d"])
          assert_equal 1, route["d"].scan("M").size, "one M per route path"
          assert_equal [nodes[mod["id"]]["cx"], nodes[mod["id"]]["cy"]], cmds.first[:to], "starts at the module's centre"
          cmds.each_cons(2).with_index do |(a, b), i|
            next if a[:op] == "M"

            assert_in_delta a[:out][0], b[:in][0], EPS, "a corner between commands #{i} and #{i + 1} of #{route['moduleId']}"
            assert_in_delta a[:out][1], b[:in][1], EPS, "a corner between commands #{i} and #{i + 1} of #{route['moduleId']}"
          end
          cmds.select { |c| c[:op] == "A" }.each do |arc|
            chord = Math.hypot(arc[:to][0] - arc[:from][0], arc[:to][1] - arc[:from][1])
            assert_in_delta arc[:r] * Math.sqrt(2), chord, EPS, "every arc is a quarter circle"
          end
          assert_in_delta last_head["cx"], cmds.last[:to][0], EPS
          assert_in_delta last_head["cy"], cmds.last[:to][1], EPS
        end
      end

      test "#{name}: a U-turn bends with one radius and clears the row end's label" do
        run = runs(stages, wave).first
        nodes = run["layout"]["nodes"].index_by { |n| n["id"] }
        paths = run["variants"].first["paths"]
        bend = (VIEW[:gutter] / 2.0) - 4
        (paths["route"] + paths["routeLocked"]).each do |route|
          mod = run["layout"]["modules"].find { |m| m["id"] == route["moduleId"] }
          arcs = parse(route["d"]).select { |c| c[:op] == "A" }
          assert_equal 2 * (mod["rows"].size - 1), arcs.size, "two arcs per row-to-row hop"
          arcs.each_slice(2).with_index do |(down, up), k|
            assert_equal down[:r], up[:r], "both arcs of a U-turn share one radius"
            assert_operator down[:r], :<=, bend + EPS
            row = mod["rows"][k]
            row_end = nodes[row["heads"].last]
            half = VIEW[:labelWidth] / 2.0
            gx = down[:to][0]
            if row["direction"] == "ltr"
              assert_operator gx - down[:r], :>=, row_end["cx"] + half - EPS, "the bend reaches into #{row_end['id']}'s label"
            else
              assert_operator gx + down[:r], :<=, row_end["cx"] - half + EPS, "the bend reaches into #{row_end['id']}'s label"
            end
          end
        end
      end

      test "#{name}: the travelled path is a prefix of the route and ends at the current head" do
        each_variant(stages, wave).each do |run, variant|
          paths = variant["paths"]
          current = variant["currentId"]
          routes = paths["route"].index_by { |r| r["moduleId"] }
          if current.nil?
            assert_empty paths["travelled"]
            assert_empty paths["spineTravelled"]
            assert_nil paths["current"]
            next
          end

          head = expected_head(run, current)
          nodes = run["layout"]["nodes"].index_by { |n| n["id"] }
          order = run["layout"]["modules"].map { |m| m["id"] }
          cur_index = order.index(head["moduleId"])
          assert_equal order.first(cur_index + 1), paths["spineTravelled"].map { |t| t["moduleId"] },
                       "the spine is travelled up to and including the current module"
          assert_equal paths["spine"].first(cur_index + 1).map { |t| t["d"] }, paths["spineTravelled"].map { |t| t["d"] }
          assert_equal head["id"], paths.dig("current", "headId")
          paths["travelled"].each do |t|
            route = routes.fetch(t["moduleId"])
            assert route["d"].start_with?(t["d"]), "travelled is not a prefix of #{t['moduleId']}'s route"
            index = order.index(t["moduleId"])
            assert_operator index, :<=, cur_index, "nothing after the current module is travelled"
            assert_equal route["d"], t["d"], "an earlier module is travelled whole" if index < cur_index
          end
          mine = paths["travelled"].find { |t| t["moduleId"] == head["moduleId"] }
          assert mine, "the current module has a travelled path"
          last = parse(mine["d"]).last[:to]
          assert_in_delta nodes[head["id"]]["cx"], last[0], EPS
          assert_in_delta nodes[head["id"]]["cy"], last[1], EPS
        end
      end

      test "#{name}: a chevron marks each curved segment still ahead, beside every label" do
        each_variant(stages, wave).each do |run, variant|
          paths = variant["paths"]
          labels = label_boxes(run)
          expected = expected_chevrons(run, paths, variant["currentId"])
          assert_equal expected.size, paths["chevrons"].size, "chevrons with current #{variant['currentId'].inspect}"
          expected.zip(paths["chevrons"]).each do |(x, y, angle), chev|
            assert_in_delta x, chev["x"], EPS
            assert_in_delta y, chev["y"], EPS
            assert_in_delta angle, chev["angle"], 1e-6
          end
          paths["chevrons"].each do |c|
            hit = labels.find { |b| c["x"] > b[:x0] && c["x"] < b[:x1] && c["y"] > b[:y0] && c["y"] < b[:y1] }
            assert_nil hit, "a chevron sits in the label of #{hit&.dig(:id)}"
          end
        end
      end
    end
  end

  test "a locked module is drawn as a locked track only: no travelled path, no chevrons, no fans" do
    stages = SHAPES.fetch("preview + locked")
    run = runs(stages, 16).first
    locked = run["layout"]["modules"].last["id"]
    run["variants"].each do |variant|
      paths = variant["paths"]
      assert_equal [locked], paths["routeLocked"].map { |r| r["moduleId"] }
      refute_includes paths["route"].map { |r| r["moduleId"] }, locked
      refute_includes paths["travelled"].map { |r| r["moduleId"] }, locked
      refute_includes paths["chevrons"].map { |c| c["moduleId"] }, locked
      locked_heads = run["layout"]["nodes"].select { |n| n["moduleId"] == locked }.map { |n| n["id"] }
      assert_empty (paths["trunk"] + paths["branch"] + paths["branchOn"]).map { |b| b["from"] } & locked_heads
      assert_equal [false, true], paths["panels"].map { |p| p["locked"] }
    end
  end

  test "a reinforcement branch is drawn solid when it is completed or current, dotted otherwise" do
    stage = JourneyShapes.stage("m0", primaries: 7, fans: { 1 => 3, 2 => 3, 4 => 3 })
    by_id = stage["topics"].index_by { |t| t["id"] }
    by_id["m0-p1-r0"]["status"] = "completed"
    by_id["m0-p1-r2"]["status"] = "completed"
    run = runs([stage], 16, currents: ["m0-p2-r1"]).first
    paths = run["variants"].last["paths"]
    on = paths["branchOn"].map { |b| b["to"] }.sort
    assert_equal %w[s:m0-p1-r0 s:m0-p1-r2 s:m0-p2-r1], on
    assert_equal 9 - 3, paths["branch"].size
    assert_equal "s:m0-p2", paths.dig("current", "headId"), "a current reinforcement travels to its parent head"
    assert_equal %w[s:m0-p1 s:m0-p2 s:m0-p4], paths["trunk"].map { |t| t["from"] }
  end

  test "a current orphan reinforcement travels to its module's anchor" do
    stages = SHAPES.fetch("orphans then fans")
    run = runs(stages, 16, currents: ["m0-o1"]).first
    paths = run["variants"].last["paths"]
    assert_equal "a:m0", paths.dig("current", "headId")
    assert_includes paths["branchOn"].map { |b| b["to"] }, "s:m0-o1"
  end

  test "the origin sits at the top of the spine" do
    run = runs(SHAPES.fetch("7 steps x 2 modules"), 16).first
    paths = run["variants"].first["paths"]
    root = run["layout"]["nodes"].find { |n| n["kind"] == "root" }
    assert_equal({ "x" => 0, "y" => root["y"] + 10 }, paths["origin"])
    assert_equal 2, paths["spine"].size
    assert_equal 2, paths["panels"].size
  end

  # ── samplePath, the one helper the assertions above lean on ─────────
  test "samplePath walks a line every `step` px, ends included" do
    points = sample("M 0 0 L 9 0", 3)
    assert_equal [[0, 0], [3, 0], [6, 0], [9, 0]], points.map { |x, y| [x.round(9), y.round(9)] }
  end

  test "samplePath walks a quarter arc on its circle" do
    # From (0, 0) right-and-down to (10, 10), clockwise: centre (0, 10).
    points = sample("M 0 0 A 10 10 0 0 1 10 10", 1)
    assert_operator points.size, :>=, 15
    points.each { |x, y| assert_in_delta 10, Math.hypot(x - 0, y - 10), 1e-9 }
    assert_equal [10, 10], points.last.map { |v| v.round(9) }
    # Counter-clockwise between the same points: centre (10, 0).
    sample("M 0 0 A 10 10 0 0 0 10 10", 1).each { |x, y| assert_in_delta 10, Math.hypot(x - 10, y), 1e-9 }
  end

  test "samplePath walks cubics and quadratics end to end" do
    c = sample("M 0 0 C 55 0 45 40 100 40", 3)
    assert_equal [0, 0], c.first
    assert_equal [100, 40], c.last.map { |v| v.round(9) }
    q = sample("M 0 0 Q 10 0 10 10", 1)
    assert_equal [10, 10], q.last.map { |v| v.round(9) }
    c.each_cons(2) { |a, b| assert_operator Math.hypot(b[0] - a[0], b[1] - a[1]), :<=, 3.5 }
  end

  test "samplePath refuses a command it does not know" do
    script = <<~JS
      import(#{PATHS_PATH.to_s.to_json}).then((m) => {
        try { m.samplePath("M 0 0 H 10", 3); process.stdout.write("no-throw") }
        catch (e) { process.stdout.write("threw") }
      })
    JS
    assert_equal "threw", node(script)
  end

  private

  RUNS = {} # rubocop:disable Style/MutableConstant

  # One node call per (stages, wave): the layout, then for each current its paths
  # and the samples of every path kind.
  def runs(stages, wave, currents: self.class.currents(stages))
    RUNS[[stages, wave, currents].to_json] ||= [run_node(stages, wave, currents)].freeze
  end

  def each_variant(stages, wave)
    run = runs(stages, wave).first
    run["variants"].map { |variant| [run, variant] }.each
  end

  def run_node(stages, wave, currents)
    opts = VIEW.merge(wave: wave)
    script = <<~JS
      Promise.all([import(#{LAYOUT_PATH.to_s.to_json}), import(#{PATHS_PATH.to_s.to_json})]).then(([L, P]) => {
        const opts = #{opts.to_json}
        const tree = L.buildTree({ title: "Ruta" }, #{stages.to_json})
        const layout = L.layoutJourney(tree, opts)
        const kinds = ["spine", "spineTravelled", "route", "routeLocked", "travelled", "trunk", "branch", "branchOn"]
        const variants = #{currents.to_json}.map((currentId) => {
          const paths = P.buildPaths(layout, tree, currentId, opts)
          const samples = Object.fromEntries(kinds.map((k) => [k, paths[k].map((p) => P.samplePath(p.d, 3))]))
          return { currentId, paths, samples }
        })
        process.stdout.write(JSON.stringify({ layout, variants }))
      })
    JS
    JSON.parse(node(script))
  end

  def sample(d, step)
    JSON.parse(node(<<~JS))
      import(#{PATHS_PATH.to_s.to_json}).then((m) => process.stdout.write(JSON.stringify(m.samplePath(#{d.to_json}, #{step}))))
    JS
  end

  def node(script)
    stdout, stderr, status = Open3.capture3("node", "--input-type=module", "-e", script)
    assert status.success?, "node failed: #{stderr}"
    stdout
  end

  # Brief §3: x ∈ [cx − lw/2, cx + lw/2], y ∈ [cy + d/2 + labelGap − 1, … + lines·lineHeight + 1].
  def label_boxes(run)
    run["layout"]["nodes"].filter_map do |n|
      lw, d =
        case n["kind"]
        when "module" then [VIEW[:moduleLabelWidth], VIEW[:moduleDiameter]]
        when "step" then [VIEW[:labelWidth], VIEW[:stepDiameter]]
        when "reinforcement" then [VIEW[:labelWidth], VIEW[:reinforcementDiameter]]
        end
      next unless lw

      y0 = n["cy"] + (d / 2.0) + VIEW[:labelGap] - 1
      { id: n["id"], x0: n["cx"] - (lw / 2.0), x1: n["cx"] + (lw / 2.0),
        y0: y0, y1: y0 + (VIEW[:labelLines] * VIEW[:labelLineHeight]) + 1 }
    end
  end

  # The head the travelled path must reach: the step itself, or for a
  # reinforcement the head its fan hangs from (an orphan's is the anchor).
  def expected_head(run, topic_id)
    nodes = run["layout"]["nodes"].index_by { |n| n["id"] }
    fan = run["layout"]["edges"].find { |e| e["kind"] == "fan" && e["to"] == "s:#{topic_id}" }
    nodes[fan ? fan["from"] : "s:#{topic_id}"]
  end

  # Every C between two heads still ahead (never the swoop out of the module), in
  # route order, at the cubic's t = 0.5 with its tangent there.
  def expected_chevrons(run, paths, current)
    order = run["layout"]["modules"].map { |m| m["id"] }
    head = current && expected_head(run, current)
    cur_index = head ? order.index(head["moduleId"]) : -1
    paths["route"].sort_by { |r| order.index(r["moduleId"]) }.flat_map do |route|
      index = order.index(route["moduleId"])
      next [] if index < cur_index

      cmds = parse(route["d"]).drop(1) # the M
      start = 1 # the module → first step segment never carries one
      if index == cur_index
        cur_point = [head["cx"], head["cy"]]
        start = cmds.index { |c| c[:to] == cur_point } + 1
      end
      cmds.each_with_index.select { |c, i| i >= start && c[:op] == "C" }.map do |c, _|
        (ax, ay) = c[:from]
        (bx, by) = c[:to]
        [(ax + bx) / 2.0, (ay + by) / 2.0, Math.atan2(by - ay, (1 - K) * (bx - ax)) * 180 / Math::PI]
      end
    end
  end

  # The grammar the module promises (addendum §C): absolute M L C Q A, numbers
  # separated by spaces. Each command gets its start, end and the unit tangents
  # entering and leaving it.
  def parse(d)
    tokens = d.split
    cmds = []
    point = nil
    until tokens.empty?
      op = tokens.shift
      take = ->(n) { Array.new(n) { Float(tokens.shift) } }
      case op
      when "M"
        to = take.(2)
        cmds << { op:, from: to, to:, in: [0, 0], out: [0, 0] }
      when "L"
        to = take.(2)
        dir = unit(point, to)
        cmds << { op:, from: point, to:, in: dir, out: dir }
      when "C"
        c1x, c1y, c2x, c2y, x, y = take.(6)
        to = [x, y]
        cmds << { op:, from: point, to:, in: unit(point, [c1x, c1y] == point ? [c2x, c2y] : [c1x, c1y]),
                  out: unit([c2x, c2y] == to ? [c1x, c1y] : [c2x, c2y], to) }
      when "Q"
        cx, cy, x, y = take.(4)
        to = [x, y]
        cmds << { op:, from: point, to:, in: unit(point, [cx, cy]), out: unit([cx, cy], to) }
      when "A"
        r, _ry, _rot, _large, sweep, x, y = take.(7)
        to = [x, y]
        dx = x - point[0]
        dy = y - point[1]
        # Quarter circle: S − C = v, E − C = v rotated ±90° by the sweep.
        v = sweep == 1 ? [(dy - dx) / 2.0, -(dx + dy) / 2.0] : [-(dx + dy) / 2.0, (dx - dy) / 2.0]
        w = [v[0] + dx, v[1] + dy]
        tangent = ->(u) { sweep == 1 ? [-u[1] / r, u[0] / r] : [u[1] / r, -u[0] / r] }
        cmds << { op:, from: point, to:, r:, in: tangent.(v), out: tangent.(w) }
      else
        flunk "unexpected path command #{op.inspect} in #{d}"
      end
      point = cmds.last[:to]
    end
    cmds
  end

  def unit(a, b)
    len = Math.hypot(b[0] - a[0], b[1] - a[1])
    len.zero? ? [0, 0] : [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
  end
end
