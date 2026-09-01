module LearningRoutesEngine
  class RouteModule < ApplicationRecord
    belongs_to :learning_route
    has_many :route_steps, -> { order(:position, :id) }

    enum :access_state, { preview: 0, locked: 1, purchased: 2 }, prefix: :access
    enum :generation_state, { outlined: 0, generating: 1, ready: 2, failed: 3 }, prefix: :generation

    validates :title, presence: true, length: { maximum: 255 }
    validates :position, presence: true,
              numericality: { only_integer: true, greater_than: 0 },
              uniqueness: { scope: :learning_route_id }
    validates :access_state, uniqueness: { scope: :learning_route_id }, if: :access_preview?
    validate :preview_is_first
    validate :preview_identity_is_permanent, on: :update
    before_destroy :prevent_preview_destruction

    def localized_title(locale = I18n.locale)
      translations.dig(locale.to_s, "title").presence || title
    end

    def localized_description(locale = I18n.locale)
      translations.dig(locale.to_s, "description").presence || description
    end

    private

    def preview_is_first
      errors.add(:position, "must be 1 for the preview module") if access_preview? && position != 1
    end

    def preview_identity_is_permanent
      return unless will_save_change_to_access_state? && access_state_in_database == "preview"

      errors.add(:access_state, "cannot change the permanent preview")
    end

    def prevent_preview_destruction
      return unless access_state_in_database == "preview"

      errors.add(:base, "the permanent preview cannot be destroyed")
      throw :abort
    end
  end
end
