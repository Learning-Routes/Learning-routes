require_relative "boot"

require "rails/all"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module LearningRoutes
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 8.1

    # Please, add to the `ignore` list any other `lib` subdirectories that do
    # not contain `.rb` files, or that should not be reloaded or eager loaded.
    # Common ones are `templates`, `generators`, or `middleware`, for example.
    config.autoload_lib(ignore: %w[assets tasks])

    # Set default time zone
    # config.time_zone = "Central Time (US & Canada)"

    # Set default locale
    config.i18n.default_locale = :en
    config.i18n.available_locales = %i[en es]

    # Generator configuration
    config.generators do |g|
      g.test_framework :test_unit
      g.fixture_replacement :fixtures
      g.orm :active_record, primary_key_type: :uuid
      g.helper false
      g.assets false
    end
  end
end
