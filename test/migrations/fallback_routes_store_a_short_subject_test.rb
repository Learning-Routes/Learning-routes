require "test_helper"
require Rails.root.join("db/migrate/20261015000001_fallback_routes_store_a_short_subject")

# The template fallback used to store a sentence as the route's subject. The
# migration rewrites exactly those sentences to the topic label the fallback
# put in the title, and leaves every other subject alone.
class FallbackRoutesStoreAShortSubjectTest < ActiveSupport::TestCase
  setup do
    @profile = LearningRoutesEngine::LearningProfile.create!(user: create_test_user, current_level: "beginner")
  end

  test "a fallback sentence becomes the topic label, in the column and in both translations" do
    route = create_route(
      topic: "Ruta de Música", locale: "es",
      subject_area: "Camino personalizado · 8 etapas · nivel beginner",
      translations: {
        "es" => { "title" => "Ruta de Música", "subject_area" => "Camino personalizado · 8 etapas · nivel beginner" },
        "en" => { "title" => "Music Route", "subject_area" => "Personalized path · 8 stages · beginner level" }
      }
    )

    migrate!
    route.reload

    assert_equal "Música", route.subject_area
    assert_equal "Música", route.translations.dig("es", "subject_area")
    assert_equal "Music", route.translations.dig("en", "subject_area")
    assert_equal "Ruta de Música", route.translations.dig("es", "title"), "titles are not touched"
  end

  test "an English fallback route is rewritten from its English title" do
    route = create_route(
      topic: "Web Development Route", locale: "en",
      subject_area: "Personalized path · 8 stages · intermediate level",
      translations: {
        "en" => { "title" => "Web Development Route", "subject_area" => "Personalized path · 8 stages · intermediate level" },
        "es" => { "title" => "Ruta de Desarrollo Web", "subject_area" => "Camino personalizado · 8 etapas · nivel intermediate" }
      }
    )

    migrate!
    route.reload

    assert_equal "Web Development", route.subject_area
    assert_equal "Desarrollo Web", route.translations.dig("es", "subject_area")
  end

  test "a route with a real subject is left exactly as it was" do
    translations = {
      "es" => { "title" => "Portugués para viajar", "subject_area" => "Idioma · Portugués" },
      "en" => { "title" => "Portuguese for travel", "subject_area" => "Language · Portuguese" }
    }
    route = create_route(topic: "Portugués para viajar", locale: "es", subject_area: "Idioma · Portugués",
                         translations: translations)
    before = route.reload.attributes.slice("subject_area", "translations", "updated_at")

    migrate!

    assert_equal before, route.reload.attributes.slice("subject_area", "translations", "updated_at")
  end

  private

  def create_route(**attrs)
    LearningRoutesEngine::LearningRoute.create!(learning_profile: @profile, status: :active, **attrs)
  end

  def migrate!
    ActiveRecord::Migration.suppress_messages { FallbackRoutesStoreAShortSubject.new.migrate(:up) }
  end
end
