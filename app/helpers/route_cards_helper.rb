# STEP 41 §3.1: the reference's route card and the "Sigue donde lo dejaste" card.
# Everything comes from the route's preloaded steps and modules (strict loading):
# the module the student is in, its primary topics (reinforcement does not count,
# as on the journey) and where they are among them.
module RouteCardsHelper
  RouteCard = Struct.new(:level, :module_number, :module_total, :module_title, :steps, :done, :current, keyword_init: true)

  def route_card_for(route)
    steps = route.route_steps.sort_by(&:position).reject { |s| LearningRoutesEngine::ReinforcementParents.reinforcement?(s) }
    current = steps.find { |s| s.position == route.current_step && !s.completed? } ||
              steps.find { |s| !s.completed? } || steps.last
    modules = route.route_modules.sort_by(&:position)
    mod = modules.find { |m| m.id == current&.route_module_id }
    in_module = steps.select { |s| s.route_module_id == mod&.id }
    RouteCard.new(level: route_level(route), module_number: (modules.index(mod) || 0) + 1, module_total: [modules.size, 1].max,
                  module_title: mod&.localized_title, steps: in_module, done: in_module.count(&:completed?),
                  current: current && !current.completed? ? current : nil)
  end

  # The module's stops along a soft wave: done ones filled with a check, the
  # current one ringed in the highlight, the rest outlined. Tokens only.
  def mini_route_svg(total, done)
    return "".html_safe if total.zero?

    xs = Array.new(total) { |i| total == 1 ? 150.0 : 18 + i * (264.0 / (total - 1)) }
    ys = Array.new(total) { |i| i.odd? ? 40 : 22 }
    wave = ->(upto) {
      (1..upto).reduce(+"M#{xs[0]} #{ys[0]}") do |d, i|
        mx = (xs[i - 1] + xs[i]) / 2
        d << " C #{mx} #{ys[i - 1]}, #{mx} #{ys[i]}, #{xs[i]} #{ys[i]}"
      end
    }
    stops = xs.each_with_index.map do |x, i|
      y = ys[i]
      if i < done
        %(<circle data-stop="done" cx="#{x}" cy="#{y}" r="8" fill="var(--color-accent)"/>) +
          %(<path d="M#{x - 3.4} #{y}l2.3 2.3 4.4-4.6" fill="none" stroke="var(--color-accent-text)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>)
      elsif i == done
        %(<circle data-stop="current" cx="#{x}" cy="#{y}" r="8" fill="var(--color-card)" stroke="var(--color-highlight)" stroke-width="3"/>)
      else
        %(<circle data-stop="todo" cx="#{x}" cy="#{y}" r="7" fill="var(--color-card)" stroke="var(--color-faint)" stroke-width="2"/>)
      end
    end
    svg = %(<svg class="route-card__map" viewBox="0 0 300 62" aria-hidden="true">) +
          %(<path d="#{wave.call(total - 1)}" fill="none" stroke="var(--color-faint)" stroke-width="2.4" stroke-dasharray=".5 7" stroke-linecap="round"/>) +
          (done.positive? ? %(<path d="#{wave.call([done, total - 1].min)}" fill="none" stroke="var(--color-accent)" stroke-width="4" stroke-linecap="round"/>) : "") +
          stops.join + "</svg>"
    # Numbers and token names only: nothing from the user reaches this markup.
    svg.html_safe # rubocop:disable Rails/OutputSafety
  end
end
