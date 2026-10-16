# frozen_string_literal: true

# STEP 38 §7. A motion scene to look at without AI: production generation is down.
#
#   bin/rails demo:motion_step EMAIL=…          one demo step per route of that user
#   bin/rails demo:motion_step:remove EMAIL=…   deletes them again
#
# The step is the `transform` scene's schema example, appended to the route's
# free preview module and marked metadata.demo_motion_step. A route with a paid
# module the user has not bought (access_state locked) is skipped, so this never
# adds content next to modules someone has yet to pay for.
module DemoMotionStep
  TITLE = "Demo: escena animada"
  MARKER = { "demo_motion_step" => true }.freeze

  def self.user!
    email = ENV["EMAIL"].to_s.strip.downcase
    abort "[demo:motion_step] EMAIL=… is required" if email.empty?

    Core::User.find_by(email: email) || abort("[demo:motion_step] no user with email #{email}")
  end

  def self.routes(user)
    LearningRoutesEngine::LearningRoute.joins(:learning_profile)
      .where(learning_routes_engine_learning_profiles: { user_id: user.id }).order(:created_at)
  end

  def self.demo_steps(route)
    LearningRoutesEngine::RouteStep.where(learning_route_id: route.id).where("metadata @> ?", MARKER.to_json)
  end
end

namespace :demo do
  desc "Append a demo step with a motion scene to each of a user's routes (EMAIL=…)"
  task motion_step: :environment do
    DemoMotionStep.routes(DemoMotionStep.user!).each do |route|
      route.with_lock do
        if LearningRoutesEngine::RouteModule.where(learning_route_id: route.id).access_locked.exists?
          next puts("[demo:motion_step] route=#{route.id} skipped: it has paid modules not bought")
        end
        next puts("[demo:motion_step] route=#{route.id} already has a demo step") if DemoMotionStep.demo_steps(route).exists?

        preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: route.id, access_state: :preview)
        step = LearningRoutesEngine::RouteStep.create!(
          learning_route: route, route_module: preview, title: DemoMotionStep::TITLE,
          position: LearningRoutesEngine::RouteStep.where(learning_route_id: route.id).maximum(:position).to_i + 1,
          status: :available, content_type: :lesson, level: :nv1, bloom_level: 1,
          metadata: DemoMotionStep::MARKER.merge(
            "content_ready" => true,
            "parsed_sections" => [
              { "type" => "motion", "scene" => "transform", "data" => ContentEngine::MotionScenes.example("transform"),
                "narration" => "Observa cómo cambia la frase." }
            ]
          )
        )
        ContentEngine::AiContent.create!(route_step: step, content_type: :text,
                                         body: "## #{DemoMotionStep::TITLE}\nUna escena de ejemplo, sin IA.")
        puts "[demo:motion_step] route=#{route.id} added step=#{step.id}"
      end
    end
  end

  namespace :motion_step do
    desc "Delete the demo motion steps from a user's routes (EMAIL=…)"
    task remove: :environment do
      DemoMotionStep.routes(DemoMotionStep.user!).each do |route|
        # strict_loading off: destroy walks the step's dependents (quiz, contents, voice responses)
        removed = DemoMotionStep.demo_steps(route).strict_loading(false).destroy_all.size
        puts "[demo:motion_step:remove] route=#{route.id} removed=#{removed}"
      end
    end
  end
end
