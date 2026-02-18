module ApplicationHelper
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

  # Derives a single accent color for a route from its UUID.
  # Returns one of 6 design-system-friendly colors.
  ROUTE_ACCENT_COLORS = %w[
    #8B80C4
    #6E9BC8
    #5BA880
    #B09848
    #B5718E
    #7EA5A0
  ].freeze

  def route_accent_color(route)
    return ROUTE_ACCENT_COLORS.first unless route&.id
    seed = route.id.to_s.delete("-").last(8).to_i(16)
    ROUTE_ACCENT_COLORS[seed % ROUTE_ACCENT_COLORS.length]
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
    /art.?history/i => "\u{1F5BC}\uFE0F",
  }.freeze

  def topic_emoji_for(topic)
    return "\u{1F4DA}" if topic.blank?
    TOPIC_EMOJI_MAP.each do |pattern, emoji|
      return emoji if topic.match?(pattern)
    end
    "\u{1F4DA}" # Default: books
  end
end
