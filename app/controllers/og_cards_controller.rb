# The share card's source (STEP 36 §3): the landing's own stage, in the light theme,
# framed for 1200×630. Routed only in development and test; the served PNGs are
# rendered from it by `OG_WRITE=1 bin/rails test test/system/og_card_test.rb`.
class OgCardsController < ApplicationController
  layout "landing"

  def show
    @current_theme = "light"
  end
end
