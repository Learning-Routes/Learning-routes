# robots.txt and sitemap.xml, rendered from config.x.public_host (STEP 36 §1).
# They were static files in public/ naming a domain with no DNS.
class SitemapsController < ApplicationController
  # Bump when a public page's content changes; it becomes every <lastmod>.
  LASTMOD = "2026-10-14".freeze

  def robots
    render formats: :text
  end

  def show
    @lastmod = LASTMOD
    @paths = [main_app.root_path, core.sign_in_path, core.sign_up_path, main_app.privacy_path, main_app.terms_path]
    render formats: :xml
  end
end
