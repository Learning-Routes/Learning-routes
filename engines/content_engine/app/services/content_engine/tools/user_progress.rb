# frozen_string_literal: true

module ContentEngine
  module Tools
    class UserProgress < RubyLLM::Tool
      description "Looks up the current user's learning progress, including streak, XP, level, " \
                  "league, and completed routes. Use this to personalize content based on the " \
                  "student's actual progress and achievements."

      param :info_type, desc: "What to look up: overview, routes, or streak", required: false

      def execute(info_type: "overview")
        user = Thread.current[:lesson_agent_user]
        unless user
          return "User progress data not available — no user context."
        end

        engagement = UserEngagement.find_by(user: user)
        unless engagement
          return { streak: 0, level: 1, xp: 0, league: "bronze", routes_completed: 0 }.to_json
        end

        case info_type.to_s
        when "routes"
          routes = LearningRoutesEngine::LearningRoute
            .joins(:learning_profile)
            .where(learning_routes_engine_learning_profiles: { user_id: user.id })

          data = {
            total_routes: routes.count,
            completed: routes.where(status: :completed).count,
            active: routes.where(status: :active).count,
            topics: routes.limit(10).pluck(:topic)
          }
        when "streak"
          data = {
            current_streak: engagement.current_streak,
            longest_streak: engagement.longest_streak,
            active_today: engagement.active_today?,
            last_activity: engagement.last_activity_date&.iso8601
          }
        else
          data = {
            current_streak: engagement.current_streak,
            current_level: engagement.current_level,
            total_xp: engagement.total_xp,
            league: engagement.current_league,
            level_progress: engagement.level_progress_percentage,
            active_today: engagement.active_today?
          }
        end

        halt data.to_json
      rescue => e
        "Could not fetch progress: #{e.message}"
      end
    end
  end
end
