module Admin
  module Api
    # The tree the studio walks to choose a step to publish a video onto.
    #
    # Field names are the Python client's contract (spec §6) — not ours to
    # improve. A step here must never carry `metadata`, a lesson body, or any
    # user data: this response crosses to a machine outside the app's session
    # boundary, so the serializer is an explicit allow-list, never `as_json`
    # on the model.
    class RoutesController < BaseController
      def index
        routes = LearningRoutesEngine::LearningRoute
          .includes(:learning_profile, route_modules: :route_steps)
          .order(:created_at, :id)

        render json: routes.map { |route| serialize_route(route) }
      end

      private

      # THE TWO MAPPINGS THAT ARE NOT COLUMNS, so the next reader does not go
      # looking for them. `learning_routes` has `topic NOT NULL` and no `title` at
      # all, so `topic` is the only honest answer to the contract's `title` — it is
      # what `localized_topic` and `Admin::RouteDetailQuery` treat as the route's
      # name. And there is no route-level `level` either: `RouteStep#level` is a
      # separate `nv1`/`nv2`/`nv3` axis, so this is the profile's `current_level`,
      # passed to the studio as a FREE STRING. The studio hands it to its script
      # writer verbatim and does not validate it against A1-B2 (owner, checkpoint 1).
      def serialize_route(route)
        {
          "id" => route.id,
          "title" => route.topic,
          "level" => route.learning_profile.current_level,
          "modules" => route.route_modules.map { |mod| serialize_module(mod) }
        }
      end

      def serialize_module(mod)
        {
          "id" => mod.id,
          "title" => mod.title,
          "position" => mod.position,
          "steps" => mod.route_steps.map { |step| serialize_step(step) }
        }
      end

      def serialize_step(step)
        video = video_summary(step)
        {
          "id" => step.id,
          "position" => step.position,
          "title" => step.title,
          "description" => step.description,
          "estimated_minutes" => step.estimated_minutes,
          "has_video" => video.present?,
          "video" => video
        }
      end

      # Reads the persisted parsed_sections column directly (never
      # SectionResolver, which can write a fresh parse) — a plain jsonb column
      # read is not an association traversal, so strict_loading is not in play
      # here.
      def video_summary(step)
        sections = step.metadata.is_a?(Hash) ? step.metadata["parsed_sections"] : nil
        section = Array(sections).find { |s| s.is_a?(Hash) && s["type"] == "video" }
        return nil unless section

        {
          "title" => section["title"],
          "duration_seconds" => section["duration_seconds"],
          "published_at" => section["published_at"]
        }
      end
    end
  end
end
