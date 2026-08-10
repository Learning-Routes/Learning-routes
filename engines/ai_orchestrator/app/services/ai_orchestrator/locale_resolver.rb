# frozen_string_literal: true

module AiOrchestrator
  # Works out which language a generation should be written in, and hands back the
  # variables every Orchestrate.call needs.
  #
  # This exists because the resolution order was written out by hand at each call site,
  # and eight of the thirteen sites simply forgot. A missing `locale` is not inert:
  # LanguageInstructions.language_name(nil) falls through to "English", so the prompt
  # ends up explicitly instructing the model to "Write the ENTIRE lesson in English".
  # A Spanish learner then gets Spanish lessons and English quizzes — the directive is
  # present, well-formed, and wrong.
  #
  # RESOLUTION ORDER — the route's own locale first, because that is the language the
  # course is being TAUGHT in, then the user's, then the application default:
  #
  #   route.locale || user.locale || I18n.default_locale
  #
  # Deliberately NOT I18n.locale. In a background job that is the process default
  # (:en) rather than anything to do with this student, and in a controller it is the
  # browser's UI preference — which is not necessarily the language of the course. A
  # student can read the interface in English while taking a course taught in Spanish.
  module LocaleResolver
    module_function

    # Locale variables for a generation that belongs to a route.
    #
    #   variables: { topic: ..., **LocaleResolver.for_route(route, user: user) }
    def for_route(route, user: nil)
      {
        locale: content_locale(route, user: user),
        target_locale: route&.target_locale.to_s
      }
    end

    # For generations with no route yet — RouteGenerator creates the route only after
    # the model answers, so the student's own locale is the only signal available.
    def for_user(user)
      {
        locale: user&.locale.presence || I18n.default_locale.to_s,
        target_locale: ""
      }
    end

    # The language the course is taught in. Also the correct argument for
    # RouteStep#localized_title / LearningRoute#localized_topic, whose default is
    # I18n.locale and therefore wrong inside a job.
    def content_locale(route, user: nil)
      route&.locale.presence ||
        (user || route&.learning_profile&.user)&.locale.presence ||
        I18n.default_locale.to_s
    end
  end
end
