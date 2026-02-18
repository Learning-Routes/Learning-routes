class LandingController < ApplicationController
  layout "landing"
  skip_before_action :authenticate_user!, raise: false

  def index
    load_personalized_route_data if current_user
  end

  private

  def load_personalized_route_data
    profile = LearningRoutesEngine::LearningProfile.find_by(user: current_user)
    return unless profile

    @active_route = LearningRoutesEngine::LearningRoute
      .where(learning_profile: profile)
      .active_routes
      .includes(:route_steps)
      .first
    return unless @active_route

    @route_nodes = build_route_nodes(@active_route)
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
    when "completed" then "Completed"
    when "in_progress" then "In progress"
    when "available" then "Available"
    when "locked" then "Locked"
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
