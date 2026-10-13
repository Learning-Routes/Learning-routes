# Where a signed-in user belongs: their most recently touched route, or the
# dashboard when they have none yet (WP-35 §5).
#
# One rule for two callers: LandingController sends a student there from `/`,
# and the navbar logo links there, so the logo never points at a page that
# bounces back (PROMPT 33).
module SignedInHomeHelper
  def signed_in_home_path(user)
    profile = LearningRoutesEngine::LearningProfile.find_by(user: user)
    return main_app.dashboard_path if profile.nil?

    route = LearningRoutesEngine::LearningRoute
      .where(learning_profile: profile)
      .where.not(status: [:draft])
      .order(updated_at: :desc)
      .first

    route ? learning_routes_engine.route_path(route) : main_app.dashboard_path
  end
end
