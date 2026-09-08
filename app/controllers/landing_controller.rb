class LandingController < ApplicationController
  layout "landing"
  skip_before_action :authenticate_user!, raise: false

  def index
    # Set HTTP cache headers for the landing page
    # Use fresh_when to leverage ETags and avoid rendering if client has cache
    fresh_when(etag: landing_cache_key, public: true) if stale_check_enabled?

    # A signed-in student with a route goes to their route (WP-35 §5).
    #
    # The landing used to render a "personalized" version of the visitor page:
    # `build_route_nodes` gave each node `sats: satellite_pattern(i)` — GEOMETRY
    # ONLY — while the marketing version gave each satellite a `topic` and a
    # `desc`. So the real version drew circles with `undefined` labels: three
    # empty rings attached to "Vocabulario de … / LEC / 01 / Completado". It also
    # took the first six steps by position, which today is two lessons and four
    # reinforcement steps.
    #
    # Rather than invent data for a decorative layout, the landing stays what it
    # is — a visitor page — and a student who has somewhere to be is sent there.
    return redirect_to(destination_for(current_user)) if current_user

    @route_nodes = default_translated_nodes
  end

  private

  # Where a signed-in student belongs instead of the landing: their most
  # recently touched route, or the dashboard when they have none yet.
  def destination_for(user)
    profile = LearningRoutesEngine::LearningProfile.find_by(user: user)
    return main_app.dashboard_path if profile.nil?

    route = LearningRoutesEngine::LearningRoute
      .where(learning_profile: profile)
      .where.not(status: [:draft])
      .order(updated_at: :desc)
      .first

    route ? learning_routes_engine.route_path(route) : main_app.dashboard_path
  end

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

  # === PERFORMANCE HELPERS ===
  # Generate a cache key for the landing page
  def landing_cache_key
    # Cache key varies by user presence and locale
    [I18n.locale, current_user&.id, @route_nodes&.first&.fetch(:id)].compact.join("-")
  end

  # Determine if HTTP caching checks should be performed
  def stale_check_enabled?
    # Only enable for non-authenticated or when there's no personalized data
    !current_user || @route_nodes == default_translated_nodes
  end
end
