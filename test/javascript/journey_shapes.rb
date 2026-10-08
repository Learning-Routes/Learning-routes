# The named route shapes the journey's pure modules are tested over: the layout
# (journey_map_layout_test.rb) and the drawn paths (journey_map_paths_test.rb).
# One list, so a shape added for one is checked by both.
module JourneyShapes
  module_function

  def topic(id, reinforcement: false, parent_id: nil)
    { "id" => id, "name" => "Tema #{id}", "status" => "available", "progress" => 0,
      "reinforcement" => reinforcement, "parent_id" => parent_id, "current" => false, "path" => "/x" }
  end

  def stage(id, primaries:, fans: {}, orphans: 0, readable: true)
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
    # A fan hangs directly under the step a row-to-row hop leaves from: the hop
    # must take the gutter, not drop through the fan (ltr row end, then rtl).
    shapes["fan under an ltr row end"] = [stage("m0", primaries: 5, fans: { 3 => 3 })]
    shapes["fan under an rtl row end"] = [stage("m0", primaries: 9, fans: { 7 => 3 })]
    shapes["preview + locked"] = [stage("m0", primaries: 7, fans: { 2 => 3 }), stage("m1", primaries: 9, readable: false)]
  end.freeze

  # WP-37b §2.4: the options the page passes. The invariants run under these too,
  # since this is the layout that ships.
  VIEW = { labelWidth: 124, labelLineHeight: 16, labelLines: 3, labelGap: 8, moduleLabelWidth: 160,
           rootWidth: 420, rootHeight: 64, rootGap: 52, rootX: 18, moduleDiameter: 52, stepDiameter: 44,
           reinforcementDiameter: 28, cellGap: 16, rowGap: 36, gutter: 84, moduleGap: 76, fanGutter: 20,
           fanGap: 8, fanRowGap: 20, rowSize: 4, fanRowSize: 3, wave: 16 }.freeze
end
