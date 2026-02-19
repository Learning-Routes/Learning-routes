class LandingController < ApplicationController
  layout "landing"
  skip_before_action :authenticate_user!, raise: false

  def index
    if current_user
      load_personalized_route_data
    else
      @route_nodes = default_translated_nodes
    end
  end

  private

  def load_personalized_route_data
    profile = LearningRoutesEngine::LearningProfile.find_by(user: current_user)
    unless profile
      @route_nodes = default_translated_nodes
      return
    end

    @active_route = LearningRoutesEngine::LearningRoute
      .where(learning_profile: profile)
      .active_routes
      .includes(:route_steps)
      .first

    if @active_route
      @route_nodes = build_route_nodes(@active_route)
    else
      @route_nodes = default_translated_nodes
    end
  end

  def build_route_nodes(route)
    steps = route.route_steps.order(:position).limit(6)
    steps.each_with_index.map do |step, i|
      {
        id: "s#{i}",
        label: step.title.truncate(18),
        tag: content_type_tag(step.content_type),
        color: status_color(step.status),
        side: i.even? ? "left" : "right",
        note: status_note(step.status),
        goal: i == steps.size - 1,
        sats: satellite_pattern(i)
      }
    end
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
      { sats: [{ a: -48, d: 1.1, r: 42 }, { a: 0, d: 1.28, r: 40 }, { a: 48, d: 1.1, r: 42 }] },
    ]
  end

  def content_type_tag(type)
    case type
    when "lesson" then "LEC"
    when "exercise" then "EJR"
    when "assessment" then "EXM"
    when "review" then "REP"
    else type&.first(3)&.upcase
    end
  end

  def status_color(status)
    case status
    when "completed" then "#5BA880"
    when "in_progress" then "#6E9BC8"
    when "available" then "#B09848"
    else "#B0A898"
    end
  end

  def status_note(status)
    case status
    when "completed" then I18n.t("landing.status.completed")
    when "in_progress" then I18n.t("landing.status.in_progress")
    when "available" then I18n.t("landing.status.available")
    when "locked" then I18n.t("landing.status.locked")
    else nil
    end
  end

  def satellite_pattern(index)
    patterns = [
      [{ a: -52, d: 1.06, r: 40 }, { a: 0, d: 1.24, r: 38 }, { a: 52, d: 1.06, r: 40 }],
      [{ a: -48, d: 1.1, r: 40 }, { a: 48, d: 1.1, r: 42 }],
      [{ a: -52, d: 1.1, r: 40 }, { a: 0, d: 1.28, r: 42 }, { a: 52, d: 1.06, r: 38 }],
      [{ a: -48, d: 1.14, r: 40 }, { a: 48, d: 1.14, r: 40 }],
      [{ a: -52, d: 1.06, r: 40 }, { a: 0, d: 1.24, r: 42 }, { a: 52, d: 1.1, r: 38 }],
      [{ a: -48, d: 1.1, r: 42 }, { a: 0, d: 1.28, r: 40 }, { a: 48, d: 1.1, r: 42 }],
    ]
    patterns[index % patterns.size]
  end
end
