module LearningRoutesEngine
  class ApplicationController < ::Core::ApplicationController
    private

    # The UI language — what buttons, labels, menus are displayed in
    def ui_locale
      I18n.locale
    end
    helper_method :ui_locale

    # The content language — what lesson text is generated in
    # Falls back to UI locale if no route in scope
    def content_locale
      @route&.locale || I18n.locale.to_s
    end
    helper_method :content_locale

    # The target language — only set for language-learning routes
    # nil for non-language routes (programming, math, science, etc.)
    def target_locale
      @route&.target_locale
    end
    helper_method :target_locale
  end
end
