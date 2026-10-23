module ApplicationHelper
  # Learning Routes' own profiles elsewhere, for the Organization JSON-LD's sameAs.
  # Only ones that exist: add a profile the day it does.
  SAME_AS = %w[https://github.com/Learning-Routes].freeze

  # The app's one icon language (STEP 41 §1.3): a 24px grid, round caps and
  # joins, a 1.75 stroke (2 at 18px and under, where thinner lines fade).
  # SVG_ICONS holds constant inner markup: the one place a view or helper marks
  # a string html_safe (STEP 37 §6). Never build these from data.
  SVG_ICONS = {
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    layers: '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>',
    arrow_right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    check_circle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    alert_circle: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    chevron_left: '<path d="M15 19l-7-7 7-7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    flame: '<path d="M12 22c-4.4 0-8-3.2-8-7.4 0-2.9 1.9-6 3.6-7.7 0 0 .5 3.1 2.7 4.9 0-4.5 3.1-8.9 5.4-10.8 0 2.7 1.3 4.5 2.7 5.8C19.8 8.2 20 10 20 11.8 20 18 16.4 22 12 22z"/>',
    star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
    github: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>',
    x_logo: '<path d="M4 4l11.733 16h4.267l-11.733-16h-4.267z"/><path d="M4 20l6.768-6.768m2.46-2.46L20 4"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    sun: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
  }.freeze

  def svg_icon(name, size: 24, **attributes)
    tag.svg(SVG_ICONS.fetch(name.to_sym).html_safe, width: size, height: size, viewBox: "0 0 24 24", fill: "none",
            stroke: "currentColor", "stroke-width": size <= 18 ? 2 : 1.75, "stroke-linecap": "round",
            "stroke-linejoin": "round", "aria-hidden": "true", **attributes)
  end

  # Absolute URL on the one public host (config.x.public_host), for canonical,
  # share tags, JSON-LD and the sitemap: never the request's host.
  # shortcut: http only for localhost, upgrade if a non-local http host appears.
  def public_url(path = "/")
    host = Rails.configuration.x.public_host
    scheme = host.start_with?("localhost") ? "http" : "https"
    "#{scheme}://#{host}#{path}"
  end

  def format_study_time(minutes)
    return "0m" if minutes.nil? || minutes == 0
    if minutes >= 60
      hours = minutes / 60
      remaining = minutes % 60
      remaining > 0 ? "#{hours}h #{remaining}m" : "#{hours}h"
    else
      "#{minutes}m"
    end
  end

  # A route's level is the level of the stage the student is in: the first step
  # not completed, or the last step once all are. The card's accent is that
  # level's token, the NV1/NV2/NV3 colour the journey map uses (STEP 38 §3);
  # it was picked from the UUID, so identical routes got different colours.
  def route_level(route)
    steps = route.route_steps.sort_by(&:position)
    (steps.find { |step| !step.completed? } || steps.last)&.level.presence || "nv1"
  end

  def route_accent_token(route)
    "--color-node-#{route_level(route)}"
  end

  # Returns a topic-relevant emoji for a route based on keyword matching.
  TOPIC_EMOJI_MAP = {
    # Programming & CS
    /python|django|flask/i => "\u{1F40D}",
    /javascript|js|node|react|vue|angular|typescript/i => "\u{1F4BB}",
    /ruby|rails/i => "\u{1F48E}",
    /java|kotlin|spring/i => "\u2615",
    /swift|ios|apple/i => "\u{1F34E}",
    /android/i => "\u{1F4F1}",
    /rust/i => "\u2699\uFE0F",
    /go\b|golang/i => "\u{1F439}",
    /c\+\+|cpp/i => "\u{1F527}",
    /html|css|web|frontend/i => "\u{1F310}",
    /sql|database|postgres/i => "\u{1F5C4}\uFE0F",
    /machine.?learn|ml\b|deep.?learn|neural|ai\b|artificial/i => "\u{1F916}",
    /data.?scien|analytics|statistics/i => "\u{1F4CA}",
    /cyber|security|hack/i => "\u{1F6E1}\uFE0F",
    /cloud|aws|azure|devops|docker|kubernetes/i => "\u2601\uFE0F",
    /git\b|version.?control/i => "\u{1F500}",
    /algorithm|struct/i => "\u{1F9E9}",
    /api|backend|server/i => "\u{1F5A5}\uFE0F",
    /game.?dev|unity|unreal/i => "\u{1F3AE}",
    /blockchain|crypto|web3/i => "\u26D3\uFE0F",
    /programm|coding|code|software|develop/i => "\u{1F468}\u200D\u{1F4BB}",

    # Math & Science
    /calculus|algebra|math|trigonometry|geometry/i => "\u{1F4D0}",
    /physics|quantum|mechanics/i => "\u269B\uFE0F",
    /chemistry|chem\b/i => "\u{1F9EA}",
    /biology|biotech|genetics/i => "\u{1F9EC}",
    /astronomy|space|cosmos/i => "\u{1F52D}",
    /engineering/i => "\u{1F3D7}\uFE0F",

    # Languages
    /english|esl|toefl|ielts/i => "\u{1F1EC}\u{1F1E7}",
    /spanish|espa/i => "\u{1F1EA}\u{1F1F8}",
    /french|fran/i => "\u{1F1EB}\u{1F1F7}",
    /german|deutsch/i => "\u{1F1E9}\u{1F1EA}",
    /japanese|nihongo/i => "\u{1F1EF}\u{1F1F5}",
    /chinese|mandarin|cantonese/i => "\u{1F1E8}\u{1F1F3}",
    /korean/i => "\u{1F1F0}\u{1F1F7}",
    /italian/i => "\u{1F1EE}\u{1F1F9}",
    /portuguese/i => "\u{1F1F5}\u{1F1F9}",
    /language|linguistic/i => "\u{1F5E3}\uFE0F",

    # Business & Finance
    /finance|invest|stock|trading/i => "\u{1F4B0}",
    /marketing|seo|growth/i => "\u{1F4E3}",
    /business|entrepreneur|startup/i => "\u{1F4BC}",
    /accounting|bookkeep/i => "\u{1F4B8}",
    /economics|econ\b/i => "\u{1F4C8}",
    /project.?manage|agile|scrum/i => "\u{1F4CB}",
    /leadership|manage/i => "\u{1F451}",

    # Creative & Design
    /design|\bux\b|\bui\b|figma/i => "\u{1F3A8}",
    /photo/i => "\u{1F4F7}",
    /video|film|cinema/i => "\u{1F3AC}",
    /music|guitar|piano|drum|sing/i => "\u{1F3B5}",
    /draw|illustrat|sketch/i => "\u270F\uFE0F",
    /writ|author|novel|storytell/i => "\u270D\uFE0F",
    /animat|3d|blender/i => "\u{1F3AC}",

    # Lifestyle & Health
    /cook|culinary|baking|food|recipe/i => "\u{1F373}",
    /fitness|workout|exercise|gym/i => "\u{1F4AA}",
    /yoga|meditat|mindful/i => "\u{1F9D8}",
    /nutrition|diet|health/i => "\u{1F34E}",
    /psychology|mental/i => "\u{1F9E0}",

    # Academic
    /history|histor/i => "\u{1F3DB}\uFE0F",
    /philosophy/i => "\u{1F4DC}",
    /sociology|social.?science/i => "\u{1F465}",
    /law|legal|juris/i => "\u2696\uFE0F",
    /education|teach|pedagog/i => "\u{1F393}",
    /art.?history/i => "\u{1F5BC}\uFE0F"
  }.freeze

  def topic_emoji_for(topic)
    return "\u{1F4DA}" if topic.blank?
    TOPIC_EMOJI_MAP.each do |pattern, emoji|
      return emoji if topic.match?(pattern)
    end
    "\u{1F4DA}" # Default: books
  end
end
