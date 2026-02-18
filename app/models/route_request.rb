class RouteRequest < ApplicationRecord
  belongs_to :user, class_name: "Core::User"
  belongs_to :learning_route, class_name: "LearningRoutesEngine::LearningRoute", optional: true

  VALID_TOPICS = %w[programming languages math science business arts].freeze
  VALID_LEVELS = %w[beginner basic intermediate advanced].freeze
  VALID_GOALS = %w[career personal exam project switch teaching].freeze
  VALID_PACES = %w[relaxed steady intensive].freeze
  VALID_STYLES = %w[visual auditory reading kinesthetic].freeze
  STATUSES = %w[pending generating completed failed].freeze

  STYLE_MAP = { "v" => :visual, "a" => :auditory, "r" => :reading, "k" => :kinesthetic }.freeze

  validates :level, presence: true, inclusion: { in: VALID_LEVELS }
  validates :pace, presence: true, inclusion: { in: VALID_PACES }
  validates :status, inclusion: { in: STATUSES }
  validate :must_have_at_least_one_topic
  validate :goals_must_be_valid
  validate :topics_must_be_valid
  validate :learning_style_answers_complete

  before_save :calculate_style_result, if: :should_calculate_style?

  scope :recent, -> { order(created_at: :desc) }
  scope :pending_or_generating, -> { where(status: %w[pending generating]) }

  TOPIC_LABELS = {
    "programming" => "Programación",
    "languages" => "Idiomas",
    "math" => "Matemáticas",
    "science" => "Ciencias",
    "business" => "Negocios",
    "arts" => "Arte y Diseño"
  }.freeze

  STYLE_LABELS = {
    "visual" => { emoji: "🎬", name: "Visual", desc: "Aprendes mejor con imágenes, videos y diagramas" },
    "auditory" => { emoji: "🎧", name: "Auditivo", desc: "Aprendes mejor escuchando explicaciones y discusiones" },
    "reading" => { emoji: "📖", name: "Lectura", desc: "Aprendes mejor leyendo y tomando notas" },
    "kinesthetic" => { emoji: "🔧", name: "Kinestésico", desc: "Aprendes mejor practicando y experimentando" },
    "multimodal" => { emoji: "🧩", name: "Multimodal", desc: "Combinas varios estilos — eres versátil" }
  }.freeze

  def topic_display
    all_topics = []
    all_topics += topics.map { |t| TOPIC_LABELS[t] || t.humanize } if topics.present?
    all_topics << custom_topic if custom_topic.present?
    all_topics
  end

  def dominant_style
    learning_style_result.dig("dominant") || "multimodal"
  end

  def style_label
    STYLE_LABELS[dominant_style] || STYLE_LABELS["multimodal"]
  end

  def generating?
    status == "generating"
  end

  def completed?
    status == "completed"
  end

  def failed?
    status == "failed"
  end

  private

  def must_have_at_least_one_topic
    if topics.blank? && custom_topic.blank?
      errors.add(:base, "Debes seleccionar al menos un tema o escribir uno personalizado")
    end
  end

  def goals_must_be_valid
    return if goals.blank?
    invalid = goals - VALID_GOALS
    errors.add(:goals, "contiene opciones inválidas: #{invalid.join(', ')}") if invalid.any?
  end

  def topics_must_be_valid
    return if topics.blank?
    invalid = topics - VALID_TOPICS
    errors.add(:topics, "contiene opciones inválidas: #{invalid.join(', ')}") if invalid.any?
  end

  def learning_style_answers_complete
    return if learning_style_answers.blank?
    answers = learning_style_answers.is_a?(Hash) ? learning_style_answers : {}
    if answers.keys.length > 0 && answers.keys.length < 6
      errors.add(:learning_style_answers, "debes responder las 6 preguntas del test")
    end
  end

  def should_calculate_style?
    learning_style_answers.is_a?(Hash) && learning_style_answers.keys.length == 6
  end

  def calculate_style_result
    scores = { visual: 0, auditory: 0, reading: 0, kinesthetic: 0 }

    learning_style_answers.each do |_q, option_id|
      style_letter = option_id.to_s[-1]
      style = STYLE_MAP[style_letter]
      scores[style] += 1 if style
    end

    sorted = scores.sort_by { |_, v| -v }
    dominant = sorted.first[0].to_s
    secondary = sorted[1][0].to_s

    if sorted[0][1] == sorted[1][1]
      dominant = "multimodal"
      secondary = "#{sorted[0][0]}+#{sorted[1][0]}"
    end

    total = scores.values.sum.to_f
    content_mix = if total > 0
      {
        video: ((scores[:visual] / total) * 100).round,
        audio: ((scores[:auditory] / total) * 100).round,
        text: ((scores[:reading] / total) * 100).round,
        interactive: ((scores[:kinesthetic] / total) * 100).round
      }
    else
      { video: 25, audio: 25, text: 25, interactive: 25 }
    end

    self.learning_style_result = {
      dominant: dominant,
      secondary: secondary,
      scores: scores,
      content_mix: content_mix
    }
  end
end
