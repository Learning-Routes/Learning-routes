class LandingController < ApplicationController
  layout "landing"
  skip_before_action :authenticate_user!, raise: false

  def index
    # Only the anonymous page is cached: a signed-in one shows the student's own
    # name and links, which this key does not cover. The key is everything the
    # anonymous page varies on — locale and the theme rendered into <html>.
    fresh_when(etag: [I18n.locale, current_theme], public: true) unless current_user

    # The landing is the landing for everyone (owner's ruling, 13 October): GET /
    # never redirects, signed in or not. Students reach their route through
    # "My routes".
    #
    # It is always the visitor page. The landing used to render a "personalized" version of the visitor page:
    # `build_route_nodes` gave each node `sats: satellite_pattern(i)` — GEOMETRY
    # ONLY — while the marketing version gave each satellite a `topic` and a
    # `desc`. So the real version drew circles with `undefined` labels: three
    # empty rings attached to "Vocabulario de … / LEC / 01 / Completado". It also
    # took the first six steps by position, which today is two lessons and four
    # reinforcement steps.
    #
    # Rather than invent data for a decorative layout, the landing stays what it
    # is — a visitor page.
    @route_nodes = default_translated_nodes
  end

  private

  # Build translated default nodes from I18n YAML + satellite geometry
  def default_translated_nodes
    geometry = default_geometry
    node_keys = %w[n1 n2 n3 n4 n5 n6]
    sides = %w[left right left right left right]

    node_keys.each_with_index.map do |key, i|
      node_t = I18n.t("path_viz.nodes.#{key}")
      geo = geometry[i]

      {
        id: key,
        label: node_t[:label],
        tag: node_t[:tag].presence,
        color: "#B0A898",
        side: sides[i],
        note: node_t[:note],
        goal: i == 5,
        sats: node_t[:sats].each_with_index.map { |sat, j|
          geo[:sats][j].merge(topic: sat[:topic], desc: sat[:desc])
        }
      }
    end
  end

  # Satellite geometry data (angles, distances, radii) — language-independent
  def default_geometry
    [
      { sats: [{ a: -52, d: 1.06, r: 40 }, { a: 0, d: 1.24, r: 38 }, { a: 52, d: 1.06, r: 40 }] },
      { sats: [{ a: -48, d: 1.1, r: 40 }, { a: 48, d: 1.1, r: 42 }] },
      { sats: [{ a: -52, d: 1.1, r: 40 }, { a: 0, d: 1.28, r: 42 }, { a: 52, d: 1.06, r: 38 }] },
      { sats: [{ a: -48, d: 1.14, r: 40 }, { a: 48, d: 1.14, r: 40 }] },
      { sats: [{ a: -52, d: 1.06, r: 40 }, { a: 0, d: 1.24, r: 42 }, { a: 52, d: 1.1, r: 38 }] },
      { sats: [{ a: -48, d: 1.1, r: 42 }, { a: 0, d: 1.28, r: 40 }, { a: 48, d: 1.1, r: 42 }] }
    ]
  end
end
