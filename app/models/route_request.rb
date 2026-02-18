class RouteRequest < ApplicationRecord
  belongs_to :user, class_name: "Core::User"
  belongs_to :learning_route, class_name: "LearningRoutesEngine::LearningRoute", optional: true

  VALID_TOPICS = %w[programming languages math science business arts].freeze
  VALID_LEVELS = %w[beginner basic intermediate advanced].freeze
  VALID_GOALS = %w[career personal exam project switch teaching].freeze
  VALID_PACES = %w[relaxed steady intensive].freeze
  STATUSES = %w[pending generating completed failed].freeze

  validates :level, presence: true, inclusion: { in: VALID_LEVELS }
  validates :pace, presence: true, inclusion: { in: VALID_PACES }
  validates :status, inclusion: { in: STATUSES }
  validate :must_have_at_least_one_topic
  validate :goals_must_be_valid
  validate :topics_must_be_valid

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

  def topic_display
    all_topics = []
    all_topics += topics.map { |t| TOPIC_LABELS[t] || t.humanize } if topics.present?
    all_topics << custom_topic if custom_topic.present?
    all_topics
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
end
