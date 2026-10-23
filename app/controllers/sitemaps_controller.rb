# robots.txt and sitemap.xml, rendered from config.x.public_host (STEP 36 §1).
# They were static files in public/ naming a domain with no DNS.
class SitemapsController < ApplicationController
  # Bump when a public page's content changes; it becomes every <lastmod>.
  LASTMOD = "2026-10-23".freeze

  def robots
    render formats: :text
  end

  def show
    @lastmod = LASTMOD
    # Each public page by locale (nil is the bare, x-default URL); STEP 36 §2.
    @pages = [
      ->(l) { main_app.root_path(locale: l) }, ->(l) { core.sign_in_path(locale: l) },
      ->(l) { core.sign_up_path(locale: l) }, ->(l) { main_app.privacy_path(locale: l) },
      ->(l) { main_app.terms_path(locale: l) }
    ]
    render formats: :xml
  end
end
