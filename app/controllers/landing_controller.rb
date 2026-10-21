class LandingController < ApplicationController
  layout "landing"
  skip_before_action :authenticate_user!, raise: false

  def index
    # Only the anonymous page is cached: a signed-in one shows the student's own
    # name and links, which this key does not cover. The key is everything the
    # anonymous page varies on — locale, the theme rendered into <html>, and the
    # session's CSRF secret (csrf_meta_tags), so a new session never gets a 304
    # carrying an old token. Never public: the page holds that token.
    fresh_when(etag: [I18n.locale, current_theme, session[:_csrf_token]]) unless current_user

    # The landing is the landing for everyone (owner's ruling, 13 October): GET /
    # never redirects, signed in or not. Students reach their route through
    # "My routes". Since STEP 41 it is the annotated map: its copy is static and
    # its example routes come from the locale.
  end
end
