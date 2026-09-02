# frozen_string_literal: true

module LearningRoutesEngine
  # The one answer to "may this user read this step's content?".
  #
  # Access is ownership plus reachability, and nothing else:
  #   * the user owns the route through LearningProfile#user_id, AND
  #   * the step's module is the free preview, OR the route has a paid purchase.
  #
  # The `owner` ROLE grants nothing here. WP-16's dashboard gives the owner
  # metadata through /admin; it must never become customer entitlement. An owner
  # reading their OWN route is allowed for the same reason any user is: they own
  # the LearningProfile, not because of their role.
  class ModuleAccessPolicy
    def self.allowed?(user:, route_id:, step_id:)
      return false unless user

      step = owned_step(user: user, step_id: step_id, route_id: route_id)
      return false if step.nil?

      reachable?(step)
    end

    def self.allowed_step?(user:, step_id:)
      allowed?(user: user, route_id: nil, step_id: step_id)
    end

    # May this user cause NEW paid AI generation on this step?
    #
    # Strictly narrower than `allowed?`. Reading is entitled by a purchase that
    # is `paid` OR `refunded`, because a refund deliberately does not revoke
    # access to content already generated (spec lines 246 and 316). Spending
    # more money is not the same question: a refunded route must stop costing
    # us. Every endpoint that enqueues an AI job — tutor replies, voice
    # evaluation, TTS, image generation — asks THIS, not `allowed?`.
    #
    # A preview module answers true either way: the free preview is free for
    # everyone, refunded or never purchased alike.
    def self.generation_allowed?(user:, step_id:, route_id: nil)
      return false unless user

      step = owned_step(user: user, step_id: step_id, route_id: route_id)
      return false if step.nil?

      return true if step[:access_state] == "preview"

      Commerce::RoutePurchase.generation_authorized?(route_id: step[:route_id])
    end

    # Two bounded queries at most, and only when the module is not the preview.
    def self.owned_step(user:, step_id:, route_id: nil)
      scope = RouteStep.joins(:route_module, learning_route: :learning_profile)
        .where(id: step_id)
        .where(learning_routes_engine_learning_profiles: { user_id: user.id })
      scope = scope.where(learning_route_id: route_id) if route_id.present?

      scope.pick(
        "learning_routes_engine_route_steps.learning_route_id",
        "learning_routes_engine_route_modules.access_state"
      )&.then { |route, access| { route_id: route, access_state: access } }
    end
    private_class_method :owned_step

    # `.pick` on a Rails `enum` attribute returns the label ("preview"), not
    # the underlying integer column value — confirmed empirically; the
    # opposite assumption (that this needs an integer comparison) silently
    # breaks every access check, because the DB stores an integer but
    # ActiveRecord type-casts pick/pluck results through the enum mapping.
    def self.reachable?(step)
      return true if step[:access_state] == "preview"

      Commerce::RoutePurchase.entitled?(route_id: step[:route_id])
    end
    private_class_method :reachable?

    # Entitlement is part of the cache identity. Without it a body cached while
    # the route was locked could be served after purchase, or worse, the reverse.
    def self.cache_key(user:, step:)
      route_module = RouteModule.find(step.route_module_id)
      entitled = Commerce::RoutePurchase.entitled?(route_id: step.learning_route_id)
      ["route-content-v2", user.id, step.learning_route_id, route_module.id,
       route_module.access_state, route_module.updated_at.to_i,
       entitled ? "entitled" : "unentitled", step.id, step.updated_at.to_i]
    end
  end
end
