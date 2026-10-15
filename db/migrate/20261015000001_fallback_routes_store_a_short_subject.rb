# The wizard's template fallback stored the route's subject as a sentence,
# "Camino personalizado · 8 etapas · nivel beginner" / "Personalized path ·
# 8 stages · beginner level", raw level key included, and the profile card and
# dashboard showed it as what the route is about. The job now stores the topic's
# label; this rewrites the routes already made.
#
# Only a subject that is exactly that generated sentence is touched. The label
# comes back from the title the same fallback wrote ("Ruta de X" / "X Route");
# a route whose title does not have that shape is left alone rather than guessed.
class FallbackRoutesStoreAShortSubject < ActiveRecord::Migration[8.1]
  SENTENCE = {
    "es" => /\ACamino personalizado · \d+ etapas · nivel [a-z_]+\z/,
    "en" => /\APersonalized path · \d+ stages · [a-z_]+ level\z/
  }.freeze
  TITLE = { "es" => /\ARuta de (.+)\z/, "en" => /\A(.+) Route\z/ }.freeze

  # Its own model: the migration must not depend on app code that changes later.
  class Route < ActiveRecord::Base
    self.table_name = "learning_routes_engine_learning_routes"
  end

  def up
    candidates = Route.where("subject_area LIKE 'Camino personalizado · %' OR subject_area LIKE 'Personalized path · %'")
                      .or(Route.where("translations::text LIKE '%Camino personalizado · %' OR translations::text LIKE '%Personalized path · %'"))
    rewritten = 0

    candidates.find_each do |route|
      translations = (route.translations || {}).deep_dup
      labels = SENTENCE.keys.index_with do |lang|
        title = translations.dig(lang, "title") || (route.topic if route.locale == lang)
        title.to_s[TITLE[lang], 1]
      end

      SENTENCE.each do |lang, sentence|
        next unless translations.dig(lang, "subject_area").to_s.match?(sentence) && labels[lang]
        translations[lang]["subject_area"] = labels[lang]
      end

      subject = route.subject_area
      lang = SENTENCE.keys.find { |l| subject.to_s.match?(SENTENCE[l]) }
      subject = labels[lang] if lang && labels[lang]

      next if subject == route.subject_area && translations == route.translations

      route.update_columns(subject_area: subject, translations: translations)
      rewritten += 1
    end

    say "rewrote the subject of #{rewritten} fallback route(s)"
  end

  def down
    # The sentences are not worth restoring: they were the bug.
  end
end
