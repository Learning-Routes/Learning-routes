require "test_helper"
require "json"
require "open3"

# STEP 41 §2.2, the owner's main point: each chapter's text sits on a free spot of
# the map — never over a stop or its name, a leg, the fan, a sheet's edge, a
# module chip, the root title or the stage's controls. Run under node against the
# real geometry, with the text shapes the landing measures (headline over body),
# in both locales; fixtures/landing_text_shapes.json is re-measured whenever the
# landing's copy or type changes (a system test reading each text's data-lay).
class LandingPlacementTest < ActiveSupport::TestCase
  MODULE_PATH = Rails.root.join("app/javascript/lib/landing_placement.js")
  SHAPES = JSON.parse(Rails.root.join("test/javascript/fixtures/landing_text_shapes.json").read)
  VIEWPORTS = %w[1440x900 1280x720 1024x768 1920x1080 768x1024 390x844].freeze

  %w[es en].each do |locale|
    VIEWPORTS.each do |viewport|
      test "#{locale} at #{viewport}: every chapter's text overlaps nothing" do
        laid = layout(SHAPES.fetch(locale).fetch(viewport))
        laid.each_with_index do |l, i|
          assert_equal 0, l["hits"], "chapter #{i} covers #{l['hits']} points of the map at #{viewport} (#{locale})"
        end
      end
    end

    # The reference left the hero 4 points over the origin marker here.
    test "#{locale} at 360x740: the hero clears the map; the camera gives way to do it" do
      laid = layout(SHAPES.fetch(locale).fetch("360x740"))
      assert_equal [0] * 6, laid.map { |l| l["hits"] }
      assert_operator laid[0]["d"], :>, 1, "the hero only clears by pulling the camera back"
      assert_operator laid[0]["d"], :<=, 1.55, "the camera pulls back no further than ×1.55"
    end
  end

  test "a point on the sheets' plane projects to the screen and back" do
    out = run_node(<<~JS)
      const model = m.buildModel(), Wd = 1440, H = 836;
      const r = m.restFor(m.camFor(2, false), Wd / H), cam = m.camera(r.pos, r.tgt, Wd, H);
      const p = model.mods[0].heads[2], s = cam.project(p), back = cam.hitPlane(s.x, s.y, p.y);
      return { s, back, p };
    JS
    assert out["s"]["x"].between?(0, 1440) && out["s"]["y"].between?(0, 836), "step 3 is on screen at chapter 2"
    %w[x y z].each { |k| assert_in_delta out["p"][k], out["back"][k], 1e-6 }
  end

  test "the map is WP-37b's: six and five stops, three modules, the fan of three under step 3" do
    out = run_node(<<~JS)
      const model = m.buildModel();
      return { stops: model.mods.map((md) => md.heads.length), fan: model.mods[0].fan.kids.length,
               locked: model.mods.map((md) => !!md.locked), legs: model.route.length, itinerary: model.itinerary.length };
    JS
    assert_equal [6, 5, 4], out["stops"]
    assert_equal 3, out["fan"]
    assert_equal [false, false, true], out["locked"]
    assert_equal 3 + 6 + 5 + 4, out["legs"], "a spine leg per module, then that module's legs"
    assert_equal 9, out["itinerary"]
  end

  private

  def layout(viewport)
    w, h = viewport["stage"]
    run_node(<<~JS)
      const model = m.buildModel();
      return #{viewport['texts'].to_json}.map((t, i) => {
        const l = m.layoutChapter(model, i, #{w}, #{h}, t.w, t.h, t.shape);
        return { hits: l.slot.hits, d: l.d };
      });
    JS
  end

  def run_node(body)
    script = <<~JS
      import(#{MODULE_PATH.to_s.to_json}).then((m) => {
        const out = (() => { #{body} })();
        process.stdout.write(JSON.stringify(out));
      })
    JS
    stdout, stderr, status = Open3.capture3("node", "--input-type=module", "-e", script)
    assert status.success?, "node failed: #{stderr}"
    JSON.parse(stdout)
  end
end
