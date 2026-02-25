module CommunityEngine
  class RouteSharer
    def self.share!(route, user, visibility: "public", description: nil)
      existing = SharedRoute.find_by(learning_route_id: route.id, user_id: user.id)
      return existing if existing

      SharedRoute.create!(
        learning_route: route,
        user: user,
        visibility: visibility,
        description: description
      )
    end

    def self.unshare!(shared_route)
      shared_route.destroy!
    end

    def self.clone!(shared_route, user)
      original_route = shared_route.learning_route

      # Deep clone the learning route
      new_route = original_route.dup
      new_route.assign_attributes(
        status: "active",
        generation_status: "completed",
        current_step: 0
      )

      # Associate with user's learning profile
      profile = user.learning_profile || LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "nv1")
      new_route.learning_profile = profile
      new_route.save!

      # Clone all steps
      original_route.route_steps.order(:position).each do |step|
        new_step = step.dup
        new_step.learning_route = new_route
        new_step.status = step.position == 1 ? "available" : "locked"
        new_step.completed_at = nil
        new_step.save!
      end

      # Track the clone
      SharedRoute.where(id: shared_route.id).update_all("clones_count = clones_count + 1")

      new_route
    end
  end
end
