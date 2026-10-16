module ApplicationHelper
  # Constant SVG markup: the one place a view or helper marks a string
  # html_safe (STEP 37 §6). Never build these from data.
  SVG_ICONS = {
    info: '<svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    layers: '<svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
    check_circle: '<svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
  }.freeze

  def svg_icon(name)
    SVG_ICONS.fetch(name.to_sym).html_safe
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
